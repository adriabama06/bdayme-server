import { test } from "node:test";
import assert from "node:assert/strict";

import rate_limit from "../../src/middlewares/rate_limit.js";

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

test("rate_limit allows up to max requests and then blocks with 429", () => {
    const middleware = rate_limit({ window_ms: 60_000, max: 3 });

    let next_calls = 0;
    const next = () => next_calls++;

    // First 3 requests pass through
    for(let i = 0; i < 3; i++) {
        const { res } = create_fake_res();
        middleware(create_fake_req("1.2.3.4"), res, next);

        assert.equal(next_calls, i + 1);
    }

    // 4th request is blocked
    const { res, state } = create_fake_res();
    middleware(create_fake_req("1.2.3.4"), res, next);

    assert.equal(next_calls, 3); // no extra next()
    assert.equal(state.status_code, 429);
    assert.ok(state.json_body.error);
    assert.match(state.json_body.error, /too many requests/i);
});

test("rate_limit tracks clients independently", () => {
    const middleware = rate_limit({ window_ms: 60_000, max: 1 });

    let next_calls = 0;

    // Each client's first request passes
    middleware(create_fake_req("5.6.7.8"), create_fake_res().res, () => next_calls++);
    middleware(create_fake_req("9.10.11.12"), create_fake_res().res, () => next_calls++);

    assert.equal(next_calls, 2);

    // Both are now limited
    const first = create_fake_res();
    middleware(create_fake_req("5.6.7.8"), first.res, () => next_calls++);
    assert.equal(first.state.status_code, 429);
    assert.equal(next_calls, 2);

    const second = create_fake_res();
    middleware(create_fake_req("9.10.11.12"), second.res, () => next_calls++);
    assert.equal(second.state.status_code, 429);
    assert.equal(next_calls, 2);
});

test("rate_limit resets the bucket after the window expires", async () => {
    const middleware = rate_limit({ window_ms: 20, max: 1 });

    let next_calls = 0;

    middleware(create_fake_req("7.7.7.7"), create_fake_res().res, () => next_calls++);
    assert.equal(next_calls, 1);

    const blocked = create_fake_res();
    middleware(create_fake_req("7.7.7.7"), blocked.res, () => next_calls++);
    assert.equal(blocked.state.status_code, 429);
    assert.equal(next_calls, 1);

    await new Promise(resolve => setTimeout(resolve, 30));

    middleware(create_fake_req("7.7.7.7"), create_fake_res().res, () => next_calls++);
    assert.equal(next_calls, 2);
});
