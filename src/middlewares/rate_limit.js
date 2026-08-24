/**
 * Minimal in-memory rate limiter, no external dependencies.
 * Keeps the same JSON error format ({ error }) as the rest of the API.
 */

const buckets = new Map(); // key -> { count, reset_at }

function cleanup_expired_buckets(now) {
    for(const [key, bucket] of buckets) {
        if(bucket.reset_at <= now) buckets.delete(key);
    }
}

/**
 * @returns {(req: any, res: any, next: () => void) => void}
 * @param {{ window_ms?: number, max?: number }} options
 */
export default function rate_limit({ window_ms = 15 * 60 * 1000, max = 5 } = {}) {
    return (req, res, next) => {
        const now = Date.now();

        // Lazy cleanup so expired buckets don't accumulate forever
        if(buckets.size > 10_000 || Math.random() < 0.01) {
            cleanup_expired_buckets(now);
        }

        const key = req.ip ?? req.socket?.remoteAddress ?? "unknown";

        let bucket = buckets.get(key);

        if(!bucket || bucket.reset_at <= now) {
            bucket = { count: 0, reset_at: now + window_ms };
            buckets.set(key, bucket);
        }

        bucket.count++;

        if(bucket.count > max) {
            return res.status(429).json({
                error: "Too many requests, please try again later"
            });
        }

        next();
    };
}
