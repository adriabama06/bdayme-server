import { test, mock } from "node:test";
import assert from "node:assert/strict";

import { create_fake_pg, create_fake_redis } from "../helpers/fakes.mjs";

const fake_pg = create_fake_pg();
const fake_redis = create_fake_redis();

mock.module("../../src/database.js", { defaultExport: fake_pg.client });
mock.module("../../src/redis.js", { defaultExport: fake_redis.client });

const profile_controller = await import("../../src/controller/profile.js");

test("MAX_ABOUTME_LENGTH is 1024", () => {
    assert.equal(profile_controller.MAX_ABOUTME_LENGTH, 1024);
});

test("create_profile validates input", async () => {
    assert.equal(await profile_controller.create_profile({}, "name", new Date()), undefined);
    assert.equal(await profile_controller.create_profile(1, 123, new Date()), undefined);
    assert.equal(await profile_controller.create_profile(1, "name", "2020-01-01"), undefined); // must be a Date
    assert.equal(await profile_controller.create_profile(1, "", new Date()), undefined); // empty display_name
    assert.equal(await profile_controller.create_profile(1, "a".repeat(65), new Date()), undefined); // too long

    assert.equal(fake_pg.calls.length, 0);
});

test("create_profile inserts and caches the profile", async () => {
    fake_redis.clear();

    const birthday = new Date("1995-06-15T00:00:00Z");
    const row = { id: 1, display_name: "Alice", aboutme: "", birthday };

    fake_pg.reset(async (sql, params) => {
        assert.equal(sql, "INSERT INTO profiles (id, display_name, birthday) VALUES ($1, $2, $3) RETURNING *");
        return { rows: [{ ...row, birthday: params[2] }], rowCount: 1 };
    });

    const profile = await profile_controller.create_profile(1, "Alice", birthday);

    assert.ok(profile);
    assert.equal(profile.display_name, "Alice");
    assert.ok(fake_redis.has("profile:1"));
});

test("get_profile serves from cache after first query", async () => {
    fake_redis.clear();

    const row = { id: 4, display_name: "Bob", aboutme: "hi", birthday: new Date() };

    fake_pg.reset(async () => ({ rows: [row], rowCount: 1 }));

    const first = await profile_controller.get_profile(4);

    // Cache miss: the raw database row (with a Date object) is returned
    assert.deepEqual(first, row);
    assert.equal(fake_pg.calls.length, 1);

    const second = await profile_controller.get_profile(4);

    // Cache hit: the JSON stored in redis comes back with dates as ISO strings
    assert.deepEqual(second, JSON.parse(JSON.stringify(row)));
    assert.equal(fake_pg.calls.length, 1);
});

test("get_profile returns undefined when not found or on invalid input/error", async () => {
    fake_pg.reset(async () => ({ rows: [], rowCount: 0 }));

    assert.equal(await profile_controller.get_profile(999), undefined);
    assert.equal(await profile_controller.get_profile({}), undefined);

    fake_pg.reset(async () => { throw new Error("boom"); });

    assert.equal(await profile_controller.get_profile(999), undefined);
});

test("get_profile_by rejects modes outside the allowlist without querying", async () => {
    fake_pg.reset(async () => ({ rows: [{ id: 5 }], rowCount: 1 }));

    assert.equal(await profile_controller.get_profile_by("1 = 1 OR display_name", "x"), undefined);
    assert.equal(await profile_controller.get_profile_by("unknown_column", "x"), undefined);
    assert.equal(fake_pg.calls.length, 0);
});

test("update_profile updates the column and refreshes the cache", async () => {
    const row = { id: 8, display_name: "NewName", aboutme: "", birthday: new Date() };

    fake_pg.reset(async (sql) => {
        assert.match(sql, /^UPDATE profiles SET (\w+) = \$2 WHERE id = \$1 RETURNING \*$/);
        return { rows: [row], rowCount: 1 };
    });

    const profile = await profile_controller.update_profile(8, "display_name", "NewName");

    assert.deepEqual(profile, row);
    assert.equal(JSON.parse(fake_redis.dump()["profile:8"]).display_name, "NewName");

    assert.equal(await profile_controller.update_profile(8, {}, "value"), undefined);
    assert.equal(await profile_controller.update_profile(8, "display_name", ""), undefined); // falsy value
});

test("update_profile rejects options outside the allowlist without querying", async () => {
    fake_pg.reset(async () => ({ rows: [{ id: 8 }], rowCount: 1 }));

    assert.equal(await profile_controller.update_profile(8, "id = 1; DROP TABLE profiles; --", "x"), undefined);
    assert.equal(await profile_controller.update_profile(8, "created_at", "x"), undefined);
    assert.equal(fake_pg.calls.length, 0);
});

test("delete_profile removes the row and cache entry", async () => {
    await fake_redis.client.set("profile:6", "{}", {});

    fake_pg.reset(async () => ({ rows: [{ id: 6 }], rowCount: 1 }));

    assert.ok(await profile_controller.delete_profile(6));
    assert.equal(fake_redis.has("profile:6"), false);
});

test("is_valid_option_profile only allows display_name, birthday and aboutme", () => {
    assert.equal(profile_controller.is_valid_option_profile("display_name"), true);
    assert.equal(profile_controller.is_valid_option_profile("birthday"), true);
    assert.equal(profile_controller.is_valid_option_profile("aboutme"), true);
    assert.equal(profile_controller.is_valid_option_profile("id"), false);
    assert.equal(profile_controller.is_valid_option_profile("; DROP TABLE profiles"), false);
});

test("parse_value_from_option_profile parses and validates values", () => {
    assert.equal(profile_controller.parse_value_from_option_profile("display_name", "ok"), "ok");
    assert.equal(profile_controller.parse_value_from_option_profile("display_name", ""), undefined);
    assert.equal(profile_controller.parse_value_from_option_profile("display_name", "a".repeat(65)), undefined);

    const parsed_date = profile_controller.parse_value_from_option_profile("birthday", "2000-01-01");
    assert.ok(parsed_date instanceof Date);
    assert.equal(isNaN(parsed_date.getTime()), false);
    assert.equal(profile_controller.parse_value_from_option_profile("birthday", "not-a-date"), undefined);

    assert.equal(profile_controller.parse_value_from_option_profile("aboutme", "hello"), "hello");
    // Values >= MAX_ABOUTME_LENGTH get truncated to the limit
    assert.equal(
        profile_controller.parse_value_from_option_profile("aboutme", "x".repeat(profile_controller.MAX_ABOUTME_LENGTH + 10)).length,
        profile_controller.MAX_ABOUTME_LENGTH
    );
    assert.equal(profile_controller.parse_value_from_option_profile("aboutme", 42), undefined);

    assert.equal(profile_controller.parse_value_from_option_profile("unknown", "v"), undefined);
});
