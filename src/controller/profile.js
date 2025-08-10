/**
 * @typedef Profile
 * @prop {number} id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, -- User ID
 * @prop {string} username VARCHAR(255) NOT NULL, -- User username
 * @prop {string} aboutme VARCHAR(1024) NOT NULL DEFAULT '', -- User shared information to other users
 * @prop {Date} birthday TIMESTAMP NOT NULL -- User birthday date
 */

export const MAX_ABOUTME_LENGTH = 1024;

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
 * @param {"id" | "username" | "aboutme" | "created_at"} mode
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

    if(username.length <= 0 || username.length > 64) return;

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

/**
 * @returns {boolean}
 * @param {string} option
 */
export function is_valid_option_profile(option) {
    return ["username", "birthday", "aboutme"].includes(option);
}

/**
 * @returns {any | undefined}
 * @param {string} option
 * @param {any} value
 */
export function parse_value_from_option_profile(option, value) {
    switch (option) {
        case "username":
            if(typeof value != "string" || username.length <= 0 || username.length > 64) return undefined;

            return value;
        
        case "birthday":
            const value_date = new Date(value);

            if(isNaN(value_date)) return undefined;

            return value_date;

        case "aboutme":
            if(typeof value !== "string") return

            if(value.length >= MAX_ABOUTME_LENGTH) return value.slice(0, MAX_ABOUTME_LENGTH);
            
            return value;

        default:
            return undefined;
    }
}
