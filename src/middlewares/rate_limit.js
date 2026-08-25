/**
 * Fixed-window rate limiter backed by Redis, so counters are shared across
 * server instances and survive restarts.
 * Keeps the same JSON error format ({ error }) as the rest of the API.
 */

import redis_client from "../redis.js";

/**
 * @returns {(req: any, res: any, next: () => void) => void}
 * @param {{ window_ms?: number, max?: number, prefix?: string }} options
 */
export default function rate_limit({ window_ms = 15 * 60 * 1000, max = 5, prefix = "generic" } = {}) {
    // Redis expiry works in whole seconds
    const window_seconds = Math.max(1, Math.ceil(window_ms / 1000));

    return async (req, res, next) => {
        const ip = req.ip ?? req.socket?.remoteAddress ?? "unknown";
        const key = `rate_limit:${prefix}:${ip}`;

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
