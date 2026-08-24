import crypto from "crypto";

import { Router } from "express";
import { get_user, is_valid_option_user, parse_value_from_option_user, update_user } from "../controller/user.js";
import middleware_auth from "../middlewares/auth.js";
import redis_client from "../redis.js";

const app = Router();

app.get("/", middleware_auth, async (req, res) => {
    delete req.user.password;

    res.status(200).json({
        data: req.user
    });
});

app.post("/update", middleware_auth, async (req, res) => {
    const data = req.body;

    for (const key in data) {
        if(!is_valid_option_user(key)) {
            return res.status(400).json({
                error: `Invalid option to update: ${key}`
            });
        }

        let value = parse_value_from_option_user(key, data[key]);

        if(value === undefined) {
            return res.status(400).json({
                error: "Invalid value to update, wrong type or wrong input."
            });
        }

        const user = await update_user(req.user.id, key, value);

        if(!user) {
            return res.status(500).json({
                error: `Error on updating the value "${data[key]}" as "${value}" in option ${key}`
            });
        }
    }

    const user_id = parseInt(req.user.id);

    let keys_to_delete = [];

    // Invalidate every token of this user using the inverse mapping
    // (user:{id}:tokens:{token}) instead of scanning all the tokens
    let cursor = 0;
    do {
        const reply = await redis_client.scan(cursor, {
            MATCH: `user:${user_id}:tokens:*`,
            COUNT: 100
        });

        cursor = parseInt(reply.cursor);

        for (const key of reply.keys) {
            const token = key.slice(`user:${user_id}:tokens:`.length);

            if(token.length > 0) {
                keys_to_delete.push(key, `token:${token}`);
            }
        }
    } while (cursor !== 0);

    if(keys_to_delete.length > 0) {
        await redis_client.del(keys_to_delete);
    }

    const new_user = await get_user(req.user.id);

    if (!new_user) {
        return res.status(500).json({
            error: "Error fetching new user"
        });
    }

    res.status(200).json({
        data: new_user
    });
});

export default app;
