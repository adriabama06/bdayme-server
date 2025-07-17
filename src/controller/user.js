/**
 * @typedef User
 * @prop {number} id SERIAL PRIMARY KEY, -- User ID
 * @prop {string} email VARCHAR(255) NOT NULL UNIQUE, -- User email
 * @prop {string} password TEXT NOT NULL, -- User encrypted password
 * @prop {Date} created_at TIMESTAMP DEFAULT NOW() -- User creation date
*/

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
        redis_client.expire(`user:${id}`, 5 * 60); // Reset expiration time
        return JSON.parse(cached);
    }

    try {
        const result = await pg_client.query("SELECT * FROM users WHERE id = $1", [id]);

        if(result.rowCount == 0) return;

        redis_client.set(`user:${id}`, JSON.stringify(result.rows[0]), { EX: 5 * 60, NX: true });

        return result.rows[0];
    } catch {
        return;
    }
}

/**
 * @returns {Promise<User | undefined>}
 * @param {"id" | "email" | "password" | "created_at"} mode
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
 * @param {string} email
 * @param {string} password
 */
export async function create_user(email, password) {
    if (typeof email != "string" || typeof password != "string") return;

    try {
        const result = await pg_client.query("INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *", [email, password]);

        redis_client.set(`user:${id}`, JSON.stringify(result.rows[0]), { EX: 5 * 60, NX: true });

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

        redis_client.get(`user:${id}`).then(data => {
            if(data) {
                redis_client.del(`user:${id}`);
            }
        });

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

        redis_client.set(`user:${id}`, JSON.stringify(result.rows[0]), { EX: 5 * 60 });

        return result.rows[0];
    } catch {
        return;
    }
}

async function test() {
    var user = await create_user("testuser@gmail.com", "testuserpass");
    if(!user) user = await get_user(2);
    console.log("User", user);


    const user_check_info_id = await get_user(user.id);
    console.log("User check info [ID]", user_check_info_id);

    const user_check_info_email = await get_user_by("email", user.email);
    console.log("User check info [EMAIL]", user_check_info_email);

    // const user_deleted = await delete_user(user.id);
    // console.log("User deleted", user_deleted);
}

// setTimeout(test, 1000);
