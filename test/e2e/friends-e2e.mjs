#!/usr/bin/env node
/**
 * E2E test of the friends system against a deployed bdayme backend.
 *
 * Usage:
 *   node test/e2e/friends-e2e.mjs [base_url]
 *   TEST_URL=https://api.example.com npm run test:e2e
 *
 * What it does:
 *   1. Registers 2 accounts and logs in with both.
 *   2. User A adds user B as friend.
 *   3. Verifies both users can see the friendship info (lists, has-check, profiles).
 *   4. Logs out from both accounts and checks that both sessions are dead.
 *   5. Prints a SQL command to delete the test accounts manually.
 */

const BASE_URL = (process.argv[2] ?? process.env.TEST_URL ?? "http://127.0.0.1:6570").replace(/\/+$/, "");
const CLIENT_VERSION = process.env.CLIENT_VERSION ?? "999.0.0";

let failures = 0;
let step_count = 0;

function step(name) {
    step_count++;
    console.log(`\n[${step_count}] ${name}`);
}

function ok(message, condition, extra = "") {
    if(condition) {
        console.log(`    OK: ${message}`);
    } else {
        failures++;
        console.log(`    FAIL: ${message}${extra ? ` (${extra})` : ""}`);
    }

    return condition;
}

async function api(method, path, { token, body } = {}) {
    const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
            "content-type": "application/json",
            "client-version": CLIENT_VERSION,
            ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        body: body !== undefined ? JSON.stringify(body) : undefined
    });

    let json = null;
    try { json = await res.json(); } catch { /* empty body (204) */ }

    return { status: res.status, json };
}

function random_suffix() {
    return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`.slice(0, 12);
}

async function main() {
    console.log(`bdayme friends E2E test against: ${BASE_URL}`);

    const suffix = random_suffix();
    const user_a = {
        username: `e2e_a_${suffix}`,
        password: `E2ePassA_${suffix}`
    };
    const user_b = {
        username: `e2e_b_${suffix}`,
        password: `E2ePassB_${suffix}`
    };

    // 0. Healthcheck
    step("Healthcheck");
    try {
        const health = await api("GET", "/healthcheck");

        if(!ok("GET /healthcheck returns 200", health.status === 200, `got ${health.status}`)) {
            throw new Error("Backend is not healthy, aborting");
        }
    } catch(err) {
        console.error(`\nCannot reach the backend at ${BASE_URL}: ${err.message}`);
        console.error("Is the backend deployed and running?");
        process.exit(2);
    }

    // 1. Create the two accounts
    step("Create account A");
    const reg_a = await api("POST", "/auth/register", { body: user_a });
    ok("POST /auth/register (A) returns 200", reg_a.status === 200, JSON.stringify(reg_a.json));
    ok("Account A has an id", Number.isInteger(reg_a.json?.data?.id));

    step("Create account B");
    const reg_b = await api("POST", "/auth/register", { body: user_b });
    ok("POST /auth/register (B) returns 200", reg_b.status === 200, JSON.stringify(reg_b.json));
    ok("Account B has an id", Number.isInteger(reg_b.json?.data?.id));

    if(!reg_a.json?.data || !reg_b.json?.data) {
        print_cleanup_sql(user_a.username, user_b.username);
        finish();
    }

    // 2. Login with both accounts
    step("Login with account A");
    const login_a = await api("POST", "/auth/login", { body: user_a });
    ok("POST /auth/login (A) returns 200", login_a.status === 200);
    ok("Login (A) returned a token", typeof login_a.json?.data?.token === "string" && login_a.json.data.token.length > 0);

    step("Login with account B");
    const login_b = await api("POST", "/auth/login", { body: user_b });
    ok("POST /auth/login (B) returns 200", login_b.status === 200);
    ok("Login (B) returned a token", typeof login_b.json?.data?.token === "string" && login_b.json.data.token.length > 0);

    if(!login_a.json?.data?.token || !login_b.json?.data?.token) {
        print_cleanup_sql(user_a.username, user_b.username);
        finish();
    }

    const token_a = login_a.json.data.token;
    const token_b = login_b.json.data.token;
    const id_a = reg_a.json.data.id;
    const id_b = reg_b.json.data.id;

    // 3. Both users create their profile
    step("Both users create their profile");
    const prof_a = await api("POST", "/profile/create", {
        token: token_a,
        body: { display_name: "E2E User A", birthday: new Date(1990, 0, 15).toISOString() }
    });
    ok("Profile created for A", prof_a.status === 200, JSON.stringify(prof_a.json));

    const prof_b = await api("POST", "/profile/create", {
        token: token_b,
        body: { display_name: "E2E User B", birthday: new Date(1992, 5, 25).toISOString() }
    });
    ok("Profile created for B", prof_b.status === 200, JSON.stringify(prof_b.json));

    // 4. User A adds user B as friend
    step(`User A (id ${id_a}) adds user B (id ${id_b}) as friend`);
    const added = await api("POST", `/friends/add/${id_b}`, { token: token_a });
    ok("POST /friends/add/:id returns 200", added.status === 200, JSON.stringify(added.json));
    ok(
        "Friendship row links A -> B",
        added.json?.data?.user_a == id_a && added.json?.data?.user_b == id_b,
        JSON.stringify(added.json)
    );

    // 5. Both users can see the info
    step("Both users can see the friend info");
    const list_a = await api("GET", "/friends", { token: token_a });
    const list_b = await api("GET", "/friends", { token: token_b });

    ok("GET /friends (A) returns 200", list_a.status === 200);
    ok("A sees B in his friend list", Array.isArray(list_a.json?.data) && list_a.json.data.some(f => f.user_a == id_a && f.user_b == id_b), JSON.stringify(list_a.json));

    ok("GET /friends (B) returns 200", list_b.status === 200);
    ok("B sees A in his friend list", Array.isArray(list_b.json?.data) && list_b.json.data.some(f => f.user_a == id_a && f.user_b == id_b), JSON.stringify(list_b.json));

    const has_ab = await api("GET", `/friends/has/${id_b}`, { token: token_a });
    const has_ba = await api("GET", `/friends/has/${id_a}`, { token: token_b });
    ok("A is friend of B (has check)", has_ab.json?.data === true, JSON.stringify(has_ab.json));
    ok("B is friend of A (has check)", has_ba.json?.data === true, JSON.stringify(has_ba.json));

    const me_a = await api("GET", "/user", { token: token_a });
    const me_b = await api("GET", "/user", { token: token_b });
    ok("A can read his own user info", me_a.status === 200 && me_a.json?.data?.username === user_a.username);
    ok("B can read his own user info", me_b.status === 200 && me_b.json?.data?.username === user_b.username);

    const profile_of_b = await api("GET", `/profile/${id_b}`, { token: token_a });
    const profile_of_a = await api("GET", `/profile/${id_a}`, { token: token_b });
    ok("A can read B's profile", profile_of_b.status === 200 && profile_of_b.json?.data?.display_name === "E2E User B", JSON.stringify(profile_of_b.json));
    ok("B can read A's profile", profile_of_a.status === 200 && profile_of_a.json?.data?.display_name === "E2E User A", JSON.stringify(profile_of_a.json));

    // 6. Logout from both accounts
    step("Logout both accounts");
    const logout_a = await api("POST", "/auth/logout", { token: token_a });
    ok("POST /auth/logout (A) returns 204", logout_a.status === 204);

    const logout_b = await api("POST", "/auth/logout", { token: token_b });
    ok("POST /auth/logout (B) returns 204", logout_b.status === 204);

    step("Sessions are dead after logout");
    const after_logout_a = await api("GET", "/user", { token: token_a });
    const after_logout_b = await api("GET", "/user", { token: token_b });
    ok("Token A rejected after logout", after_logout_a.status === 400, `got ${after_logout_a.status}`);
    ok("Token B rejected after logout", after_logout_b.status === 400, `got ${after_logout_b.status}`);

    print_cleanup_sql(user_a.username, user_b.username);
    finish();
}

function sql_escape(value) {
    return value.replace(/'/g, "''");
}

function print_cleanup_sql(username_a, username_b) {
    const a = sql_escape(username_a);
    const b = sql_escape(username_b);

    console.log(`
------------------------------------------------------------
Cleanup SQL (run it by hand against the backend database):

  docker exec -it <postgres_container> psql -U bdayme -d bdayme

Then:

-- Delete the E2E test accounts (profiles and friends are deleted
-- automatically by ON DELETE CASCADE):
DELETE FROM users WHERE username IN ('${a}', '${b}');

-- If you prefer to be explicit instead of relying on cascades:
-- BEGIN;
-- DELETE FROM friends WHERE user_a IN (SELECT id FROM users WHERE username IN ('${a}', '${b}')) OR user_b IN (SELECT id FROM users WHERE username IN ('${a}', '${b}'));
-- DELETE FROM profiles WHERE id IN (SELECT id FROM users WHERE username IN ('${a}', '${b}'));
-- DELETE FROM users WHERE username IN ('${a}', '${b}');
-- COMMIT;

Note: session tokens live in Redis under keys like "token:<uuid>" and expire
on their own; logout already removed the tokens used in this test.
------------------------------------------------------------`);
}

function finish() {
    console.log("\n============================================================");

    if(failures > 0) {
        console.log(`RESULT: FAILED with ${failures} failed check(s)`);
        process.exitCode = 1;
    } else {
        console.log(`RESULT: PASSED, all ${step_count} steps completed successfully`);
    }
}

main().catch(err => {
    console.error(`Unexpected error: ${err}`);
    process.exitCode = 2;
});
