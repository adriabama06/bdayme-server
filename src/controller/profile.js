/**
 * @typedef Profile
 * @prop {number} id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, -- User ID
 * @prop {string} username VARCHAR(255) NOT NULL, -- User username
 * @prop {Date} birthday TIMESTAMP NOT NULL -- User birthday date
 */

import pg_client from "../database.js";
import redis_client from "../redis.js";

/**
 * @returns {Promise<Profile | undefined>}
 * @param {number | string} id
 */
export async function get_profile(id) {
    if (typeof id != "number" && typeof id != "string") return;

    const cached = await redis_client.get(`profile:${id}`);

    if(cached) {
        await redis_client.expire(`profile:${id}`, 5 * 60); // Reset expiration time
        return JSON.parse(cached);
    }

    try {
        const result = await pg_client.query("SELECT * FROM profiles WHERE id = $1", [id]);

        if(result.rowCount == 0) return;

        await redis_client.set(`profile:${id}`, JSON.stringify(result.rows[0]), { EX: 5 * 60, NX: true });

        return result.rows[0];
    } catch {
        return;
    }
}

/**
 * @returns {Promise<Profile | undefined>}
 * @param {"id" | "username" | "created_at"} mode
 * @param {string} input
 */
export async function get_profile_by(mode, input) {
    try {
        const result = await pg_client.query(`SELECT * FROM profiles WHERE ${mode} = $1`, [input]);

        return result.rows[0];
    } catch {
        return;
    }
}

/**
 * @returns {Promise<Profile | undefined>}
 * @param {number | string} id
 * @param {string} email
 * @param {Date} birthday
 */
export async function create_profile(id, username, birthday) {
    if (typeof id != "number" && typeof id != "string" || typeof username != "string" || !(birthday instanceof Date)) return;

    if(username.length <= 0) return;

    try {
        const result = await pg_client.query("INSERT INTO profiles (id, username, birthday) VALUES ($1, $2, $3) RETURNING *", [id, username, birthday]);

        await redis_client.set(`profile:${id}`, JSON.stringify(result.rows[0]), { EX: 5 * 60, NX: true });

        return result.rows[0];
    } catch {
        return;
    }
}

/**
 * @returns {Promise<Profile | undefined>}
 * @param {number | string} id
 */
export async function delete_profile(id) {
    if (typeof id != "number" && typeof id != "string") return;

    try {
        const result = await pg_client.query("DELETE FROM profiles WHERE id = $1 RETURNING *", [id]);

        await redis_client.del(`profile:${id}`);

        return result.rows[0];
    } catch {
        return;
    }
}

/**
 * @returns {Promise<Profile | undefined>}
 * @param {number | string} id
 * @param {string} option
 * @param {any} value
 */
export async function update_profile(id, option, value) {
    if (typeof id != "number" && typeof id != "string" || typeof option != "string" || !value) return;

    try {
        const result = await pg_client.query(`UPDATE profiles SET ${option} = $2 WHERE id = $1 RETURNING *`, [id, value]);

        await redis_client.set(`profile:${id}`, JSON.stringify(result.rows[0]), { EX: 5 * 60 });

        return result.rows[0];
    } catch (err) {
        return;
    }
}
