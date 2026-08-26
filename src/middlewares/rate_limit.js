/**
 * Fixed-window rate limiter backed by Redis, so counters are shared across
 * server instances and survive restarts.
 * Keeps the same JSON error format ({ error }) as the rest of the API.
 */

import redis_client from "../redis.js";

/**
 * Client IP used as rate limit key by default: prefers the first
 * X-Forwarded-For entry when present, otherwise the connection address.
 */
function get_client_ip(req) {
    const forwarded = req.headers?.["x-forwarded-for"];

    if(typeof forwarded === "string") {
        const ips = forwarded.split(",").map(ip => ip.trim()).filter(ip => ip.length > 0);

        if(ips.length > 0) return ips[0];
    }

    return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}

/**
 * @returns {(req: any, res: any, next: () => void) => void}
 * @param {{ window_ms?: number, max?: number, prefix?: string, get_key?: (req: any) => unknown }} options
 */
export default function rate_limit({ window_ms = 15 * 60 * 1000, max = 5, prefix = "generic", get_key = null } = {}) {
    // Redis expiry works in whole seconds
    const window_seconds = Math.max(1, Math.ceil(window_ms / 1000));

    return async (req, res, next) => {
        // Custom identity given by the caller (e.g. username). Falls back to
        // the client IP when missing/empty so the limit can't be bypassed.
        const custom_key = typeof get_key === "function" ? get_key(req) : undefined;
        const source = (typeof custom_key === "string" && custom_key.length > 0) ? custom_key : get_client_ip(req);
        const key = `rate_limit:${prefix}:${source}`;

        try {
            // SET ... NX ... EX creates the window together with its TTL in one
            // atomic step, so the key can't stay without expiry if this process
            // dies before counting
            await redis_client.set(key, 0, { EX: window_seconds, NX: true });

            const count = await redis_client.incr(key);

            if(count > max) {
                return res.status(429).json({
                    error: "Too many requests, please try again later"
                });
            }

            next();
        }
        catch(err) {
            // Don't take the API down if Redis hiccups
            console.error("[RATE_LIMIT] Error:", err);
            next();
        }
    };
}
