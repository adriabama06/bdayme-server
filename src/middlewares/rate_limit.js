/**
 * Fixed-window rate limiter backed by Redis, so counters are shared across
 * server instances and survive restarts.
 * Keeps the same JSON error format ({ error }) as the rest of the API.
 */

import redis_client from "../redis.js";

/**
 * Prefers the forwarded client IP: the last X-Forwarded-For entry is the one
 * appended by our own reverse proxy, so it can't be spoofed by the client.
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
 * @param {{ window_ms?: number, max?: number, prefix?: string }} options
 */
export default function rate_limit({ window_ms = 15 * 60 * 1000, max = 5, prefix = "generic" } = {}) {
    // Redis expiry works in whole seconds
    const window_seconds = Math.max(1, Math.ceil(window_ms / 1000));

    return async (req, res, next) => {
        const key = `rate_limit:${prefix}:${get_client_ip(req)}`;

        try {
            const count = await redis_client.incr(key);

            // First request of the window starts the expiry
            if(count === 1) {
                await redis_client.expire(key, window_seconds);
            }

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
