import { test, mock } from "node:test";
import assert from "node:assert/strict";

import { create_fake_redis } from "../helpers/fakes.mjs";

let fake_time = Date.now();
const fake_redis = create_fake_redis({ now_ms: () => fake_time });

mock.module("../../src/redis.js", { defaultExport: fake_redis.client });

// Import AFTER mocking redis
const rate_limit = (await import("../../src/middlewares/rate_limit.js")).default;

function create_fake_req(ip) {
    return { ip };
}

function create_fake_res() {
    const state = { status_code: undefined, json_body: undefined };

    const res = {
        status(code) {
            state.status_code = code;
            return res;
        },
        json(body) {
            state.json_body = body;
            return res;
        }
    };

    return { res, state };
}

test("rate_limit allows up to max requests and then blocks with 429", async () => {
    const middleware = rate_limit({ prefix: "test-max", window_ms: 60_000, max: 3 });

    let next_calls = 0;
    const next = () => next_calls++;

    // First 3 requests pass through
    for(let i = 0; i < 3; i++) {
        const { res } = create_fake_res();
        await middleware(create_fake_req("1.2.3.4"), res, next);

        assert.equal(next_calls, i + 1);
    }

    // 4th request is blocked
    const { res, state } = create_fake_res();
    await middleware(create_fake_req("1.2.3.4"), res, next);

    assert.equal(next_calls, 3); // no extra next()
    assert.equal(state.status_code, 429);
    assert.ok(state.json_body.error);
    assert.match(state.json_body.error, /too many requests/i);
});

test("rate_limit tracks clients independently", async () => {
    const middleware = rate_limit({ prefix: "test-clients", window_ms: 60_000, max: 1 });

    let next_calls = 0;

    // Each client's first request passes
    await middleware(create_fake_req("5.6.7.8"), create_fake_res().res, () => next_calls++);
    await middleware(create_fake_req("9.10.11.12"), create_fake_res().res, () => next_calls++);

    assert.equal(next_calls, 2);

    // Both are now limited
    const first = create_fake_res();
    await middleware(create_fake_req("5.6.7.8"), first.res, () => next_calls++);
    assert.equal(first.state.status_code, 429);
    assert.equal(next_calls, 2);

    const second = create_fake_res();
    await middleware(create_fake_req("9.10.11.12"), second.res, () => next_calls++);
    assert.equal(second.state.status_code, 429);
    assert.equal(next_calls, 2);
});

test("rate_limit resets the bucket after the window expires", async () => {
    const middleware = rate_limit({ prefix: "test-window", window_ms: 20, max: 1 });

    let next_calls = 0;

    await middleware(create_fake_req("7.7.7.7"), create_fake_res().res, () => next_calls++);
    assert.equal(next_calls, 1);

    const blocked = create_fake_res();
    await middleware(create_fake_req("7.7.7.7"), blocked.res, () => next_calls++);
    assert.equal(blocked.state.status_code, 429);
    assert.equal(next_calls, 1);

    // Advance past the window (redis expiry is whole seconds)
    fake_time += 2000;

    await middleware(create_fake_req("7.7.7.7"), create_fake_res().res, () => next_calls++);
    assert.equal(next_calls, 2);
});

test("rate_limit keys on the forwarded IP appended by the proxy", async () => {
    const middleware = rate_limit({ prefix: "test-forwarded", window_ms: 60_000, max: 1 });

    let next_calls = 0;

    // The proxy appends the real client IP after any spoofed entries,
    // so the last X-Forwarded-For entry wins
    await middleware(
        { ip: "10.0.0.2", headers: { "x-forwarded-for": "9.9.9.9, 6.6.6.6" } },
        create_fake_res().res,
        () => next_calls++
    );
    assert.equal(next_calls, 1);

    const blocked = create_fake_res();
    await middleware(
        { ip: "10.0.0.2", headers: { "x-forwarded-for": "9.9.9.9, spoofed.example" } },
        blocked.res,
        () => next_calls++
    );
    assert.equal(blocked.state.status_code, 429);
});

test("rate_limit falls back to req.ip without a forwarded header", async () => {
    const middleware = rate_limit({ prefix: "test-fallback", window_ms: 60_000, max: 1 });

    let next_calls = 0;

    await middleware({ ip: "4.4.4.4" }, create_fake_res().res, () => next_calls++);
    assert.equal(next_calls, 1);

    const blocked = create_fake_res();
    await middleware({ ip: "4.4.4.4" }, blocked.res, () => next_calls++);
    assert.equal(blocked.state.status_code, 429);
});

test("rate_limit stores counters under a per-prefix key with expiry", async () => {
    const register = rate_limit({ prefix: "register", window_ms: 3_600_000, max: 100 });
    const login = rate_limit({ prefix: "login", window_ms: 900_000, max: 5 });
    const req = create_fake_req("8.8.8.8");

    await register(req, create_fake_res().res, () => {});
    await login(req, create_fake_res().res, () => {});

    // Each limiter has its own bucket for the same IP
    assert.equal(await fake_redis.client.get("rate_limit:register:8.8.8.8"), "1");
    assert.equal(await fake_redis.client.get("rate_limit:login:8.8.8.8"), "1");

    // Buckets expire after their window
    assert.ok(await fake_redis.client.ttl("rate_limit:register:8.8.8.8") <= 3600);
    assert.ok(await fake_redis.client.ttl("rate_limit:login:8.8.8.8") <= 900);
});
