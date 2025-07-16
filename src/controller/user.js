/**
 * @typedef User
 * @prop {number} id SERIAL PRIMARY KEY, -- User ID
 * @prop {string} username VARCHAR(255) NOT NULL UNIQUE, -- User username
 * @prop {string} email VARCHAR(255) NOT NULL UNIQUE, -- User email
 * @prop {string} password TEXT NOT NULL, -- User encrypted password
 * @prop {Date} created_at TIMESTAMP DEFAULT NOW() -- User creation date
 */

/**
 * @typedef Profiles
 * @prop {number} id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, -- User ID
 * @prop {Date} birthday TIMESTAMP NOT NULL -- User birthday date
 */

import pg_client from "../database.js";
import redis_client from "../redis.js";

/**
 * @returns {Promise<User | undefined>}
 * @param {number | string} id
 */
export async function get_user(id) {
    if (typeof id != "number" && typeof id != "string") return;

    const cached = await redis_client.get(`users:${id}`);

    if(cached) {
        redis_client.expire(`users:${id}`, 5 * 60, "NX"); // Reset expiration time
        return JSON.parse(cached);
    }

    try {
        const result = await pg_client.query("SELECT * FROM users WHERE id = $1", [id]);

        redis_client.set(`users:${id}`, JSON.stringify(result.rows[0]), { EX: 5 * 60, NX: true });

        return result.rows[0];
    } catch {
        return;
    }
}

/**
 * @returns {Promise<User | undefined>}
 * @param {"id" | "username" | "email" | "password" | "birthday" | "created_at"} mode
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
 * @param {string} email
 * @param {string} password
 * @param {Date} birthday
 */
export async function create_user(username, email, password) {
    if (typeof username != "string" || typeof email != "string" || typeof password != "string" /* || !(birthday instanceof Date) */) return;

    try {
        const result = await pg_client.query("INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING *", [username, email, password]);

        redis_client.set(`users:${id}`, JSON.stringify(result.rows[0]), { EX: 5 * 60, NX: true });

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

        redis_client.get(`users:${id}`).then(data => {
            if(data) {
                redis_client.del(`users:${id}`);
            }
        });

        return result.rows[0];
    } catch {
        return;
    }
}

async function test() {
    var user = await create_user("testuser", "testuser@gmail.com", "testuserpass");
    if(!user) user = await get_user(2);
    console.log("User", user);


    const user_check_info_id = await get_user(user.id);
    console.log("User check info [ID]", user_check_info_id);

    const user_check_info_username = await get_user_by("username", user.username);
    console.log("User check info [USERNAME]", user_check_info_username);

    // const user_deleted = await delete_user(user.id);
    // console.log("User deleted", user_deleted);
}

// setTimeout(test, 1000);