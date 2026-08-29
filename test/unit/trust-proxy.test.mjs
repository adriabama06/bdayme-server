import { test } from "node:test";
import assert from "node:assert/strict";

import express from "express";
import setup_trust_proxy from "../../src/trust_proxy.js";

/**
 * Boots a throwaway express app with the given TRUST_PROXY value and returns
 * what `req.ip` resolves to for a request from 127.0.0.1 carrying an
 * X-Forwarded-For header.
 */
async function get_req_ip(trust_value, forwarded_for = "1.2.3.4") {
    if(trust_value === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = trust_value;

    const app = express();
    await setup_trust_proxy(app);

    app.get("/", (req, res) => res.json({ ip: req.ip }));

    const server = app.listen(0);
    try {
        const res = await fetch(`http://127.0.0.1:${server.address().port}/`, {
            headers: { "x-forwarded-for": forwarded_for }
        });

        return (await res.json()).ip;
    }
    finally {
        server.close();
    }
}

test("literal entries (loopback, IPs, subnets) are trusted as-is", async () => {
    assert.equal(await get_req_ip("loopback,10.0.0.0/8"), "1.2.3.4");
    assert.equal(await get_req_ip("127.0.0.1"), "1.2.3.4");
});

test("docker service names are resolved to their container IP", async () => {
    // "localhost" goes through the hostname path (DNS resolution with
    // /etc/hosts fallback) and must end up trusted, like "traefik" in compose
    assert.equal(await get_req_ip("localhost"), "1.2.3.4");
});

test("untrusted proxy: X-Forwarded-For is ignored", async () => {
    // The socket address is reported as 127.0.0.1 or ::ffff:127.0.0.1
    // depending on the environment, but never the forwarded one
    const ip = await get_req_ip(undefined);
    assert.match(ip, /^(::ffff:)?127\.0\.0\.1$/);
    assert.notEqual(ip, "1.2.3.4");
});
