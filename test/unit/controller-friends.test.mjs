import { test, mock } from "node:test";
import assert from "node:assert/strict";

import { create_fake_pg, create_fake_redis } from "../helpers/fakes.mjs";

const fake_pg = create_fake_pg();
const fake_redis = create_fake_redis();

mock.module("../../src/database.js", { defaultExport: fake_pg.client });
mock.module("../../src/redis.js", { defaultExport: fake_redis.client });

const friends_controller = await import("../../src/controller/friends.js");

test("has_friend returns true/false based on the database", async () => {
    fake_pg.reset(async () => ({ rows: [{ "?column?": 1 }], rowCount: 1 }));

    assert.equal(await friends_controller.has_friend(1, 2), true);
    assert.equal(fake_pg.calls.at(-1).sql, "SELECT 1 FROM friends WHERE (user_a = $1 AND user_b = $2) OR (user_a = $2 AND user_b = $1)");

    fake_pg.reset(async () => ({ rows: [], rowCount: 0 }));

    assert.equal(await friends_controller.has_friend(1, 2), false);
});

test("has_friend rejects self check and invalid types without querying", async () => {
    fake_pg.reset();

    assert.equal(await friends_controller.has_friend(1, 1), undefined);
    assert.equal(await friends_controller.has_friend("1", {}), undefined);
    assert.equal(await friends_controller.has_friend({}, "1"), undefined);

    assert.equal(fake_pg.calls.length, 0);
});

test("has_friend returns undefined on a database error", async () => {
    fake_pg.reset(async () => { throw new Error("db down"); });

    assert.equal(await friends_controller.has_friend(1, 2), undefined);
});

test("create_friend inserts the friendship and clears both caches", async () => {
    await fake_redis.client.set("friends:1", JSON.stringify([{ stale: true }]), {});
    await fake_redis.client.set("friends:2", JSON.stringify([{ stale: true }]), {});

    const friend_row = { user_a: 1, user_b: 2, created_at: new Date() };

    fake_pg.reset((sql) => {
        if(sql.startsWith("SELECT 1 FROM friends")) return Promise.resolve({ rows: [], rowCount: 0 });
        if(sql.startsWith("INSERT INTO friends")) return Promise.resolve({ rows: [friend_row], rowCount: 1 });
        throw new Error(`Unexpected sql: ${sql}`);
    });

    const friend = await friends_controller.create_friend(1, 2);

    assert.deepEqual(friend, friend_row);
    // Cache of both users must be invalidated
    assert.equal(fake_redis.has("friends:1"), false);
    assert.equal(fake_redis.has("friends:2"), false);
});

test("create_friend refuses to add yourself or an existing friend", async () => {
    fake_pg.reset((sql) => {
        if(sql.startsWith("SELECT 1 FROM friends")) return Promise.resolve({ rows: [{ "?column?": 1 }], rowCount: 1 });
        throw new Error(`Unexpected sql: ${sql}`);
    });

    assert.equal(await friends_controller.create_friend(5, 5), undefined); // self
    assert.equal(await friends_controller.create_friend(1, 2), undefined); // already friends

    // No INSERT was attempted
    assert.ok(fake_pg.calls.every(call => call.sql.startsWith("SELECT 1 FROM friends")));
});

test("create_friend validates input types and handles db errors", async () => {
    fake_pg.reset(async () => { throw new Error("boom"); });

    assert.equal(await friends_controller.create_friend({}, 2), undefined);
    assert.equal(await friends_controller.create_friend(1, null), undefined);
    assert.equal(await friends_controller.create_friend(1, 2), undefined); // db error
});

test("get_friends returns [] for users without friends (and caches it)", async () => {
    fake_pg.reset(async () => ({ rows: [], rowCount: 0 }));

    const friends = await friends_controller.get_friends(42);

    assert.deepEqual(friends, []);
    // An empty list is also cached (not left undefined)
    assert.equal(fake_redis.dump()["friends:42"], "[]");
});

test("get_friends serves from cache after first query", async () => {
    const rows = [
        { user_a: 10, user_b: 11, created_at: new Date() },
        { user_a: 12, user_b: 10, created_at: new Date() }
    ];

    await fake_redis.client.del("friends:10");
    fake_redis.clear();

    fake_pg.reset(async () => ({ rows, rowCount: rows.length }));

    const first = await friends_controller.get_friends(10);

    assert.equal(first.length, 2);
    assert.equal(fake_pg.calls.length, 1);

    const second = await friends_controller.get_friends(10);

    assert.deepEqual(second, JSON.parse(JSON.stringify(rows)));
    assert.equal(fake_pg.calls.length, 1); // served from redis
});

test("get_friends invalidates its cache when a friend is added", async () => {
    fake_redis.clear();

    let inserted = false;

    fake_pg.reset((sql) => {
        if(sql.startsWith("SELECT * FROM friends WHERE user_a")) {
            return Promise.resolve({ rows: [], rowCount: 0 });
        }
        if(sql.startsWith("SELECT 1 FROM friends")) {
            return Promise.resolve({ rows: [], rowCount: 0 });
        }
        if(sql.startsWith("INSERT INTO friends")) {
            inserted = true;
            return Promise.resolve({ rows: [{ user_a: 20, user_b: 21, created_at: new Date() }], rowCount: 1 });
        }
        throw new Error(`Unexpected sql: ${sql}`);
    });

    // Populate cache with an empty list
    await friends_controller.get_friends(20);
    assert.ok(fake_redis.has("friends:20"));

    await friends_controller.create_friend(20, 21);
    assert.ok(inserted);

    // Cache must have been cleared by create_friend
    assert.equal(fake_redis.has("friends:20"), false);
    assert.equal(fake_redis.has("friends:21"), false);
});

test("delete_friend removes the friendship and clears caches", async () => {
    await fake_redis.client.set("friends:30", "[]", {});
    await fake_redis.client.set("friends:31", "[]", {});

    const row = { user_a: 30, user_b: 31, created_at: new Date() };

    fake_pg.reset(async () => ({ rows: [row], rowCount: 1 }));

    const deleted = await friends_controller.delete_friend(30, 31);

    assert.deepEqual(deleted, row);
    assert.equal(fake_redis.has("friends:30"), false);
    assert.equal(fake_redis.has("friends:31"), false);
});

test("delete_friend returns undefined when there is nothing to delete", async () => {
    fake_pg.reset(async () => ({ rows: [], rowCount: 0 }));

    assert.equal(await friends_controller.delete_friend(40, 41), undefined);
    assert.equal(await friends_controller.delete_friend(41, 41), undefined); // self
    assert.equal(await friends_controller.delete_friend("x", 41), undefined); // bad type
});
