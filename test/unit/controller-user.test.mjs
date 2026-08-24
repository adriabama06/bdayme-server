import crypto from "node:crypto";
import { test, mock } from "node:test";
import assert from "node:assert/strict";

import { create_fake_pg, create_fake_redis } from "../helpers/fakes.mjs";

const fake_pg = create_fake_pg();
const fake_redis = create_fake_redis();

mock.module("../../src/database.js", { defaultExport: fake_pg.client });
mock.module("../../src/redis.js", { defaultExport: fake_redis.client });

const user_controller = await import("../../src/controller/user.js");

function sha256(text) {
    return crypto.createHash("sha256").update(text).digest("hex");
}

test("create_user validates input types and lengths", async () => {
    assert.equal(await user_controller.create_user(123, "password123"), undefined);
    assert.equal(await user_controller.create_user("user", 123), undefined);
    assert.equal(await user_controller.create_user("abc", "password123"), undefined); // username < 5
    assert.equal(await user_controller.create_user("a".repeat(65), "password123"), undefined); // username > 64
    assert.equal(await user_controller.create_user("validuser", "short"), undefined); // password < 8
    assert.equal(await user_controller.create_user("validuser", "p".repeat(256)), undefined); // password > 255

    assert.equal(fake_pg.calls.length, 0);
});

test("create_user inserts hashed password and caches the user", async () => {
    fake_pg.reset(async (sql, params) => ({
        rows: [{ id: 7, username: params[0], password: params[1], created_at: new Date() }],
        rowCount: 1
    }));

    const user = await user_controller.create_user("newuser", "supersecret");

    assert.ok(user);
    assert.equal(user.id, 7);
    assert.equal(user.username, "newuser");
    assert.equal(user.password, sha256("supersecret"));
    assert.ok(fake_redis.has("user:7"));

    // Cache stores the raw row as JSON
    const cached = JSON.parse(fake_redis.dump()["user:7"]);
    assert.equal(cached.id, 7);
});

test("get_user returns undefined on invalid id type", async () => {
    assert.equal(await user_controller.get_user({}), undefined);
    assert.equal(await user_controller.get_user(null), undefined);
});

test("get_user queries the database on cache miss and caches it", async () => {
    fake_pg.reset(async () => ({
        rows: [{ id: 3, username: "cacheduser", password: "hash", created_at: new Date() }],
        rowCount: 1
    }));

    const first = await user_controller.get_user(3);

    assert.ok(first);
    assert.equal(first.username, "cacheduser");
    assert.equal(fake_pg.calls.length, 1);
    assert.equal(fake_pg.calls[0].sql, "SELECT * FROM users WHERE id = $1");
    assert.deepEqual(fake_pg.calls[0].params, [3]);

    // Second call must be served from redis without hitting postgres again
    const second = await user_controller.get_user(3);

    // Dates come back as ISO strings from the JSON cache
    assert.deepEqual(second, JSON.parse(JSON.stringify(first)));
    assert.equal(fake_pg.calls.length, 1);
});

test("get_user returns undefined when the user does not exist", async () => {
    fake_pg.reset(async () => ({ rows: [], rowCount: 0 }));

    assert.equal(await user_controller.get_user(999), undefined);
});

test("get_user_by returns the first matching row or undefined on error", async () => {
    fake_pg.reset(async (sql, params) => ({
        rows: [{ id: 5, username: params[0], password: "hash" }],
        rowCount: 1
    }));

    const user = await user_controller.get_user_by("username", "someone");

    assert.ok(user);
    assert.equal(user.id, 5);

    fake_pg.reset(async () => { throw new Error("db down"); });

    assert.equal(await user_controller.get_user_by("username", "someone"), undefined);
});

test("get_user_by rejects modes outside the allowlist without querying", async () => {
    fake_pg.reset(async () => ({ rows: [{ id: 5 }], rowCount: 1 }));

    assert.equal(await user_controller.get_user_by("1 = 1 OR username", "x"), undefined);
    assert.equal(await user_controller.get_user_by("unknown_column", "x"), undefined);
    assert.equal(fake_pg.calls.length, 0);
});

test("update_user updates the column and refreshes the cache", async () => {
    const updated_row = { id: 2, username: "updatedname", password: "hash" };

    fake_pg.reset(async (sql, params) => ({ rows: [updated_row], rowCount: 1 }));

    const user = await user_controller.update_user(2, "username", "updatedname");

    assert.deepEqual(user, updated_row);
    assert.equal(JSON.parse(fake_redis.dump()["user:2"]).username, "updatedname");

    assert.equal(await user_controller.update_user({}, "username", "x"), undefined);
    assert.equal(await user_controller.update_user(2, 5, "x"), undefined);
    assert.equal(await user_controller.update_user(2, "username", ""), undefined);
});

test("update_user rejects options outside the allowlist without querying", async () => {
    fake_pg.reset(async () => ({ rows: [{ id: 2 }], rowCount: 1 }));

    assert.equal(await user_controller.update_user(2, "id = 1; DROP TABLE users; --", "x"), undefined);
    assert.equal(await user_controller.update_user(2, "created_at", "x"), undefined);
    assert.equal(fake_pg.calls.length, 0);
});

test("delete_user removes the row and its cache entry", async () => {
    await fake_redis.client.set("user:9", JSON.stringify({ id: 9 }), {});

    fake_pg.reset(async () => ({ rows: [{ id: 9 }], rowCount: 1 }));

    const deleted = await user_controller.delete_user(9);

    assert.ok(deleted);
    assert.equal(fake_redis.has("user:9"), false);

    fake_pg.reset(async () => { throw new Error("boom"); });

    assert.equal(await user_controller.delete_user(9), undefined);
});

test("is_valid_option_user only allows username and password", () => {
    assert.equal(user_controller.is_valid_option_user("username"), true);
    assert.equal(user_controller.is_valid_option_user("password"), true);
    assert.equal(user_controller.is_valid_option_user("id"), false);
    assert.equal(user_controller.is_valid_option_user("created_at"), false);
    assert.equal(user_controller.is_valid_option_user("DROP TABLE users"), false);
});

test("parse_value_from_option_user parses and validates values", () => {
    assert.equal(user_controller.parse_value_from_option_user("username", "goodname"), "goodname");
    assert.equal(user_controller.parse_value_from_option_user("username", "ab"), undefined); // too short
    assert.equal(user_controller.parse_value_from_option_user("username", "a".repeat(65)), undefined); // too long
    assert.equal(user_controller.parse_value_from_option_user("username", 42), undefined);

    assert.equal(
        user_controller.parse_value_from_option_user("password", "newpassword"),
        sha256("newpassword")
    );
    assert.equal(user_controller.parse_value_from_option_user("password", "short"), undefined);
    assert.equal(user_controller.parse_value_from_option_user("password", 12345678), undefined);

    assert.equal(user_controller.parse_value_from_option_user("unknown", "value"), undefined);
});
