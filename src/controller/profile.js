/**
 * @typedef Profile
 * @prop {number} id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, -- User ID
 * @prop {string} display_name VARCHAR(255) NOT NULL, -- Public displayed name of the user (different from the login username)
 * @prop {string} aboutme VARCHAR(1024) NOT NULL DEFAULT '', -- User shared information to other users
 * @prop {Date} birthday TIMESTAMP NOT NULL -- User birthday date
 */

import pg_client from "../database.js";
import redis_client from "../redis.js";
import { MAX_ABOUTME_LENGTH } from "../constants.js";

// Never build SQL with columns outside of these lists (SQL injection protection)
const PROFILE_SELECTABLE_COLUMNS = ["id", "display_name", "aboutme", "created_at"];
const PROFILE_UPDATABLE_COLUMNS = ["display_name", "birthday", "aboutme"];

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
 * @param {"id" | "display_name" | "aboutme" | "created_at"} mode
 * @param {string} input
 */
export async function get_profile_by(mode, input) {
    if (!PROFILE_SELECTABLE_COLUMNS.includes(mode)) return;

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
 * @param {string} display_name
 * @param {Date} birthday
 */
export async function create_profile(id, display_name, birthday) {
    if (typeof id != "number" && typeof id != "string" || typeof display_name != "string" || !(birthday instanceof Date)) return;

    if(display_name.length <= 0 || display_name.length > 64) return;

    try {
        const result = await pg_client.query("INSERT INTO profiles (id, display_name, birthday) VALUES ($1, $2, $3) RETURNING *", [id, display_name, birthday]);

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
    if (!PROFILE_UPDATABLE_COLUMNS.includes(option)) return;

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
    return ["display_name", "birthday", "aboutme"].includes(option);
}

/**
 * @returns {any | undefined}
 * @param {string} option
 * @param {any} value
 */
export function parse_value_from_option_profile(option, value) {
    switch (option) {
        case "display_name":
            if(typeof value != "string" || value.length <= 0 || value.length > 64) return undefined;

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
