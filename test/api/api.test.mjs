import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";

import { create_fake_redis, create_emulated_db } from "../helpers/fakes.mjs";

const db = create_emulated_db();
const fake_redis = create_fake_redis();

// Raise the rate limits so the API tests don't hit the auth rate limiters
process.env.REGISTER_RATE_LIMIT_MAX ??= "100000";
process.env.LOGIN_RATE_LIMIT_MAX ??= "100000";

mock.module("../../src/database.js", { defaultExport: { query: db.query, connect: async () => {}, on: () => {} } });
mock.module("../../src/redis.js", { defaultExport: fake_redis.client });

// Import the API routers AFTER mocking database/redis
const auth_api = (await import("../../src/api/auth.js")).default;
const user_api = (await import("../../src/api/user.js")).default;
const profile_api = (await import("../../src/api/profile.js")).default;
const friends_api = (await import("../../src/api/friends.js")).default;
const code_api = (await import("../../src/api/code.js")).default;

const express = (await import("express")).default;

let server, base_url;

before(async () => {
    const app = express();
    app.use(express.json());
    app.use("/auth", auth_api);
    app.use("/user", user_api);
    app.use("/profile", profile_api);
    app.use("/friends", friends_api);
    app.use("/code", code_api);

    server = app.listen(0);
    base_url = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
    server?.close();
});

async function api(method, path, options = {}) {
    const headers = {
        "content-type": "application/json",
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {})
    };

    if("authorization" in options) headers.authorization = options.authorization;

    const res = await fetch(`${base_url}${path}`, {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    });

    let json = null;
    try { json = await res.json(); } catch { /* no body (204) */ }

    return { status: res.status, json, headers: res.headers };
}

function random_name(prefix) {
    return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

test("auth: register validates the body", async () => {
    let res = await api("POST", "/auth/register", { body: {} });
    assert.equal(res.status, 400);
    assert.ok(res.json.error);

    res = await api("POST", "/auth/register", { body: { username: 42, password: "password123" } });
    assert.equal(res.status, 400);

    res = await api("POST", "/auth/register", { body: { username: "abc", password: "password123" } }); // < 5 chars
    assert.equal(res.status, 400);

    res = await api("POST", "/auth/register", { body: { username: "validname", password: "short" } }); // < 8 chars
    assert.equal(res.status, 400);
});

test("auth: register creates an user without leaking the password", async () => {
    const username = random_name("api_user_a");
    const password = "apipassword_a";

    const res = await api("POST", "/auth/register", { body: { username, password } });

    assert.equal(res.status, 200);
    assert.equal(res.json.data.username, username);
    assert.ok(Number.isInteger(res.json.data.id));
    assert.equal(res.json.data.password, undefined);
    assert.ok(res.json.data.created_at);

    // The stored password is a sha256 hash
    const stored = db.tables.users.find(u => u.username === username);
    assert.equal(stored.password.length, 64);
    assert.notEqual(stored.password, password);
});

test("auth: register rejects duplicated usernames", async () => {
    const username = random_name("api_dup");
    const password = "apipassword";

    assert.equal((await api("POST", "/auth/register", { body: { username, password } })).status, 200);

    const dup = await api("POST", "/auth/register", { body: { username, password } });

    assert.equal(dup.status, 400);
    assert.match(dup.json.error, /already in use/i);
});

test("auth: login validates credentials and returns a token", async () => {
    const username = random_name("api_login");
    const password = "loginpassword";
    await api("POST", "/auth/register", { body: { username, password } });

    // Same generic error for unknown user and wrong password (no user enumeration)
    let res = await api("POST", "/auth/login", { body: { username: "no_such_user_here", password } });
    assert.equal(res.status, 400);
    assert.match(res.json.error, /invalid username or password/i);

    res = await api("POST", "/auth/login", { body: { username, password: "wrongpassword" } });
    assert.equal(res.status, 400);
    assert.match(res.json.error, /invalid username or password/i);

    res = await api("POST", "/auth/login", { body: { username, password } });
    assert.equal(res.status, 200);
    assert.ok(res.json.data.token);
    assert.equal(res.json.data.username, username);
    assert.match(res.headers.get("authorization") ?? "", /^Bearer /);
});

test("protected routes require a valid token", async () => {
    let res = await api("GET", "/user");
    assert.equal(res.status, 400);

    res = await api("GET", "/user", { authorization: "" });
    assert.equal(res.status, 400);

    res = await api("GET", "/user", { token: "not-a-real-token" });
    assert.equal(res.status, 400);
});

test("full friends flow between two users", async () => {
    // Create two accounts
    const username_a = random_name("flow_a");
    const username_b = random_name("flow_b");

    const reg_a = await api("POST", "/auth/register", { body: { username: username_a, password: "password_aaa" } });
    const reg_b = await api("POST", "/auth/register", { body: { username: username_b, password: "password_bbb" } });
    assert.equal(reg_a.status, 200);
    assert.equal(reg_b.status, 200);

    // Login both
    const login_a = await api("POST", "/auth/login", { body: { username: username_a, password: "password_aaa" } });
    const login_b = await api("POST", "/auth/login", { body: { username: username_b, password: "password_bbb" } });
    assert.equal(login_a.status, 200);
    assert.equal(login_b.status, 200);

    const token_a = login_a.json.data.token;
    const token_b = login_b.json.data.token;
    const id_a = login_a.json.data.id;
    const id_b = login_b.json.data.id;

    // Both can create their profile
    assert.equal(
        (await api("POST", "/profile/create", { token: token_a, body: { display_name: "User A", birthday: new Date(1990, 4, 10).toISOString() } })).status,
        200
    );
    assert.equal(
        (await api("POST", "/profile/create", { token: token_b, body: { display_name: "User B", birthday: new Date(1995, 7, 20).toISOString() } })).status,
        200
    );

    // A adds B as friend
    const added = await api("POST", `/friends/add/${id_b}`, { token: token_a });
    assert.equal(added.status, 200);
    assert.equal(added.json.data.user_a, id_a);
    assert.equal(added.json.data.user_b, id_b);

    // Adding again fails (already friends)
    assert.equal((await api("POST", `/friends/add/${id_b}`, { token: token_a })).status, 500);

    // Self-friend is rejected by the controller
    assert.equal((await api("POST", `/friends/add/${id_a}`, { token: token_a })).status, 500);

    // Friend of a non-existent user is rejected (FK violation)
    assert.equal((await api("POST", "/friends/add/999999", { token: token_a })).status, 500);

    // Invalid ids (non numeric, negative, zero)
    assert.equal((await api("POST", "/friends/add/abc", { token: token_a })).status, 400);
    assert.equal((await api("POST", "/friends/add/-1", { token: token_a })).status, 400);
    assert.equal((await api("POST", "/friends/add/0", { token: token_a })).status, 400);
    assert.equal((await api("GET", "/friends/has/xyz", { token: token_a })).status, 400);
    assert.equal((await api("GET", "/friends/has/-5", { token: token_a })).status, 400);
    assert.equal((await api("POST", "/friends/remove/nope", { token: token_a })).status, 400);

    // Both see each other in their friends list
    const list_a = await api("GET", "/friends", { token: token_a });
    const list_b = await api("GET", "/friends", { token: token_b });

    assert.equal(list_a.status, 200);
    assert.equal(list_b.status, 200);
    assert.ok(list_a.json.data.some(f => f.user_a === id_a && f.user_b === id_b));
    assert.ok(list_b.json.data.some(f => f.user_a === id_a && f.user_b === id_b));

    // has/:id works in both directions
    assert.equal((await api("GET", `/friends/has/${id_b}`, { token: token_a })).json.data, true);
    assert.equal((await api("GET", `/friends/has/${id_a}`, { token: token_b })).json.data, true);

    // Both can read their own user info
    assert.equal((await api("GET", "/user", { token: token_a })).json.data.username, username_a);
    assert.equal((await api("GET", "/user", { token: token_b })).json.data.username, username_b);

    // Both can read each other's profiles
    const profile_of_b_by_a = await api("GET", `/profile/${id_b}`, { token: token_a });
    const profile_of_a_by_b = await api("GET", `/profile/${id_a}`, { token: token_b });

    assert.equal(profile_of_b_by_a.status, 200);
    assert.equal(profile_of_b_by_a.json.data.display_name, "User B");
    assert.equal(profile_of_a_by_b.status, 200);
    assert.equal(profile_of_a_by_b.json.data.display_name, "User A");

    // Own profile endpoint
    assert.equal((await api("GET", "/profile", { token: token_a })).json.data.display_name, "User A");

    // Profile endpoints require authentication (no public enumeration of ids)
    assert.equal((await api("GET", "/profile/notanumber")).status, 400);
    assert.equal((await api("GET", "/profile/999999")).status, 400);

    // Profile endpoints validate ids
    assert.equal((await api("GET", "/profile/notanumber", { token: token_a })).status, 400);
    assert.equal((await api("GET", "/profile/999999", { token: token_a })).status, 404);

    // Profile update
    const updated = await api("POST", "/profile/update", { token: token_a, body: { aboutme: "hello there" } });
    assert.equal(updated.status, 200);
    assert.equal(updated.json.data.aboutme, "hello there");

    // Remove the friendship
    const removed = await api("POST", `/friends/remove/${id_b}`, { token: token_a });
    assert.equal(removed.status, 200);
    assert.deepEqual([removed.json.data.user_a, removed.json.data.user_b], [id_a, id_b]);

    assert.equal((await api("GET", `/friends/has/${id_b}`, { token: token_a })).json.data, false);
    assert.deepEqual(await api("GET", "/friends", { token: token_a }).then(r => r.json.data), []);
});

test("code accept validates the code format and adds friends", async () => {
    const username_a = random_name("code_a");
    const username_b = random_name("code_b");

    await api("POST", "/auth/register", { body: { username: username_a, password: "password_aaa" } });
    await api("POST", "/auth/register", { body: { username: username_b, password: "password_bbb" } });

    const login_a = await api("POST", "/auth/login", { body: { username: username_a, password: "password_aaa" } });
    const login_b = await api("POST", "/auth/login", { body: { username: username_b, password: "password_bbb" } });

    const token_a = login_a.json.data.token;
    const token_b = login_b.json.data.token;

    // Malformed codes are rejected before touching Redis
    assert.equal((await api("GET", "/code/accept/not-a-uuid", { token: token_b })).status, 400);
    assert.equal((await api("GET", `/code/accept/${"a".repeat(500)}`, { token: token_b })).status, 400);
    assert.equal((await api("GET", "/code/accept/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa", { token: token_b })).status, 400); // 35 chars

    // Well shaped but unknown code -> still invalid
    assert.equal((await api("GET", "/code/accept/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", { token: token_b })).status, 400);

    // Full flow
    const created = await api("POST", "/code/create", { token: token_a });
    assert.equal(created.status, 200);
    assert.match(created.json.data.code, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    assert.equal(created.json.data.direct_url, undefined);

    const accepted = await api("GET", `/code/accept/${created.json.data.code}`, { token: token_b });
    assert.equal(accepted.status, 204);

    // Codes are single use
    assert.equal((await api("GET", `/code/accept/${created.json.data.code}`, { token: token_b })).status, 400);

    // They are friends now
    assert.equal((await api("GET", "/friends", { token: token_b })).json.data.length, 1);
});

test("logout invalidates the session", async () => {
    const username = random_name("api_logout");
    const password = "logoutpassword";

    await api("POST", "/auth/register", { body: { username, password } });
    const login = await api("POST", "/auth/login", { body: { username, password } });
    const token = login.json.data.token;

    assert.equal((await api("GET", "/user", { token })).status, 200);
    assert.equal((await api("POST", "/auth/logout", { token })).status, 204);
    // Token must be dead after logout
    assert.equal((await api("GET", "/user", { token })).status, 400);
});

test("user update invalidates all tokens of that user", async () => {
    const username = random_name("api_update");
    const password = "updatepassword";

    await api("POST", "/auth/register", { body: { username, password } });

    // Create two sessions for the same user (two devices)
    const login_1 = await api("POST", "/auth/login", { body: { username, password } });
    const login_2 = await api("POST", "/auth/login", { body: { username, password } });
    const token = login_1.json.data.token;
    const user_id = login_1.json.data.id;

    const new_username = random_name("api_renamed");
    const updated = await api("POST", "/user/update", { token, body: { username: new_username } });

    assert.equal(updated.status, 200);
    assert.equal(updated.json.data.username, new_username);

    // All previous tokens were invalidated, on every device
    assert.equal((await api("GET", "/user", { token })).status, 400);
    assert.equal((await api("GET", "/user", { token: login_2.json.data.token })).status, 400);

    // The inverse mapping keys were cleaned up too
    assert.deepEqual(
        Object.keys(fake_redis.dump()).filter(key => key.startsWith(`user:${user_id}:tokens:`)),
        []
    );

    // Login with the new username works
    const relogin = await api("POST", "/auth/login", { body: { username: new_username, password } });
    assert.equal(relogin.status, 200);

    // Invalid update option
    assert.equal(
        (await api("POST", "/user/update", { token: relogin.json.data.token, body: { id: 12345 } })).status,
        400
    );
});
