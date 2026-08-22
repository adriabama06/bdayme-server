/**
 * @typedef User
 * @prop {number} id SERIAL PRIMARY KEY, -- User ID
 * @prop {string} username VARCHAR(64) NOT NULL UNIQUE, -- User login username (different from the profile display name)
 * @prop {string} password TEXT NOT NULL, -- User encrypted password
 * @prop {Date} created_at TIMESTAMP DEFAULT NOW() -- User creation date
*/

import crypto from "crypto";

import pg_client from "../database.js";
import redis_client from "../redis.js";

/**
 * @returns {Promise<User | undefined>}
 * @param {number | string} id
 */
export async function get_user(id) {
    if (typeof id != "number" && typeof id != "string") return;

    const cached = await redis_client.get(`user:${id}`);

    if(cached) {
        await redis_client.expire(`user:${id}`, 5 * 60); // Reset expiration time
        return JSON.parse(cached);
    }

    try {
        const result = await pg_client.query("SELECT * FROM users WHERE id = $1", [id]);

        if(result.rowCount == 0) return;

        await redis_client.set(`user:${id}`, JSON.stringify(result.rows[0]), { EX: 5 * 60, NX: true });

        return result.rows[0];
    } catch {
        return;
    }
}

/**
 * @returns {Promise<User | undefined>}
 * @param {"id" | "username" | "password" | "created_at"} mode
 * @param {string} input
 */
export async function get_user_by(mode, input) {
    try {
        const result = await pg_client.query(`SELECT * FROM users WHERE ${mode} = $1`, [input]);

        return result.rows[0];
    } catch {
        return;
    }
}

/**
 * @returns {Promise<User | undefined>}
 * @param {string} username
 * @param {string} password
 */
export async function create_user(username, password) {
    if (typeof username != "string" || typeof password != "string") return;

    if(username.length > 64 || password.length > 255 || username.length < 5 || password.length < 8) return;

    try {
        const result = await pg_client.query("INSERT INTO users (username, password) VALUES ($1, $2) RETURNING *", [username, crypto.createHash('sha256').update(password).digest('hex')]);

        if(result.rowCount == 0) return;

        await redis_client.set(`user:${result.rows[0].id}`, JSON.stringify(result.rows[0]), { EX: 5 * 60, NX: true });

        return result.rows[0];
    } catch {
        return;
    }
}

/**
 * @returns {Promise<User | undefined>}
 * @param {number | string} id
 */
export async function delete_user(id) {
    if (typeof id != "number" && typeof id != "string") return;

    try {
        const result = await pg_client.query("DELETE FROM users WHERE id = $1 RETURNING *", [id]);

        await redis_client.del(`user:${id}`);

        return result.rows[0];
    } catch {
        return;
    }
}

/**
 * @returns {Promise<User | undefined>}
 * @param {number | string} id
 * @param {string} option
 * @param {any} value
 */
export async function update_user(id, option, value) {
    if (typeof id != "number" && typeof id != "string" || typeof option != "string" || !value) return;

    try {
        const result = await pg_client.query(`UPDATE users SET ${option} = $2 WHERE id = $1 RETURNING *`, [id, value]);

        await redis_client.set(`user:${id}`, JSON.stringify(result.rows[0]), { EX: 5 * 60 });

        return result.rows[0];
    } catch {
        return;
    }
}

/**
 * @returns {boolean}
 * @param {string} option
 */
export function is_valid_option_user(option) {
    return ["username", "password"].includes(option);
}

/**
 * @returns {any | undefined}
 * @param {string} option
 * @param {any} value
 */
export function parse_value_from_option_user(option, value) {
    switch (option) {
        case "username":
            if(typeof value !== "string" || value.length < 5 || value.length > 64) return undefined;

            return value;
        
        case "password":
            if(typeof value !== "string" || value.length < 8 || value.length > 255) return undefined;

            const hashPassword = crypto.createHash("sha256").update(value).digest("hex");

            return hashPassword;

        default:
            return undefined;
    }
}
