import { test } from "node:test";
import assert from "node:assert/strict";

import middleware_valid_id from "../../src/middlewares/valid_id.js";

function run(raw) {
    const state = { status_code: undefined, next_called: false, validated_id: undefined };

    const req = { params: { id: raw } };
    const res = {
        status(code) {
            state.status_code = code;
            return res;
        },
        json() {
            return res;
        }
    };

    middleware_valid_id(req, res, () => {
        state.next_called = true;
        state.validated_id = req.validated_id;
    });

    return state;
}

test("valid_id accepts positive safe integers", () => {
    for(const [raw, expected] of [["1", 1], ["42", 42], ["007", 7], ["9007199254740991", 9007199254740991]]) {
        const state = run(raw);

        assert.equal(state.next_called, true, `should accept ${raw}`);
        assert.equal(state.status_code, undefined);
        assert.equal(state.validated_id, expected);
    }
});

test("valid_id rejects anything that is not a positive integer", () => {
    for(const raw of ["-1", "0", "-0", "1.5", "abc", "", "12abc", " 12", "12 ", "99999999999999999999" /* > MAX_SAFE_INTEGER */, "0x10", "1e3"]) {
        const state = run(raw);

        assert.equal(state.next_called, false, `should reject "${raw}"`);
        assert.equal(state.status_code, 400);
    }
});
