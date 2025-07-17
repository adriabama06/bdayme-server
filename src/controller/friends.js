/**
 * @typedef Friend
 * @prop {number} user_a INT REFERENCES users(id) ON DELETE CASCADE, -- ID User A
 * @prop {number} user_b INT REFERENCES users(id) ON DELETE CASCADE, -- ID User B
 * @prop {Date} created_at TIMESTAMP DEFAULT NOW(), -- Timestamp indicating when this relationship was created (automatically filled with the current time upon insert)
 */

import pg_client from "../database.js";
import redis_client from "../redis.js";

/**
 * @returns {Promise<Friend[]>}
 * @param {number | string} id
 */
export async function get_friends(id) {
    if (typeof id != "number" && typeof id != "string") return;

    const cached = await redis_client.get(`friends:${id}`);

    if(cached) {
        await redis_client.expire(`friends:${id}`, 5 * 60); // Reset expiration time
        return JSON.parse(cached);
    }

    try {
        const result = await pg_client.query("SELECT * FROM friends WHERE user_a = $1 OR user_b = $1", [id]);

        if(result.rowCount == 0) { result.rows = []; }

        await redis_client.set(`friends:${id}`, JSON.stringify(result.rows), { EX: 5 * 60, NX: true });

        return result.rows;
    } catch {
        return;
    }
}

/**
 * @returns {Promise<Friend | undefined>}
 * @param {number | string} user_a
 * @param {number | string} user_b
 */
export async function create_friend(user_a, user_b) {
    if (typeof user_a != "number" && typeof user_a != "string" || typeof user_b != "number" && typeof user_b != "string") return;

    try {
        if(parseInt(user_a) == parseInt(user_b)) return;

        const result = await pg_client.query("INSERT INTO friends (user_a, user_b) VALUES ($1, $2) RETURNING *", [user_a, user_b]);

        if(result.rowCount == 0) return;

        // Delete cache to prevent errors
        await Promise.all([
            redis_client.del(`friends:${user_a}`),
            redis_client.del(`friends:${user_b}`)
        ]);

        return result.rows[0];
    } catch {
        return;
    }
}

/**
 * @returns {Promise<Friend | undefined>}
 * @param {number | string} user_a
 * @param {number | string} user_b
 */
export async function delete_friend(user_a, user_b) {
    if (typeof user_a != "number" && typeof user_a != "string" || typeof user_b != "number" && typeof user_b != "string") return;

    try {
        if(parseInt(user_a) == parseInt(user_b)) return;

        const result = await pg_client.query("DELETE FROM friends WHERE (user_a = $1 AND user_b = $2) OR (user_a = $2 OR user_b = $1) RETURNING *", [user_a, user_b]);

        if(result.rowCount == 0) return;

        await Promise.all([
            redis_client.del(`friends:${user_a}`),
            redis_client.del(`friends:${user_b}`)
        ]);

        return result.rows[0];
    } catch (Err) {
        console.log(Err);
        return;
    }
}
