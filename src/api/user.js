import crypto from "crypto";

import { Router } from "express";
import { get_user, update_user } from "../controller/user.js";
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

    if (typeof data.email !== "string" || typeof data.password !== "string") {
        return res.status(400).json({
            error: "Email & Password must be a string"
        });
    }

    if(email.length > 255 || password.length > 255 || email.length < 5 || password.length < 8) {
        return res.status(400).json({
            error: "Email and password can't be more than 255 charecters or email can't be shorter than 5 and password can't be shorter than 8 char"
        });
    }

    if (data.email !== req.user.email) {
        const status = await update_user(req.user.id, "email", data.email);

        if (!status) {
            return res.status(500).json({
                error: "Error updating email"
            });
        }
    }

    const hashPassword = crypto.createHash('sha256').update(data.password).digest('hex');

    if (data.password !== "" && hashPassword !== req.user.password) {
        const status = await update_user(req.user.id, "password", hashPassword);

        if (!status) {
            return res.status(500).json({
                error: "Error updating password"
            });
        }
    }

    const userId = parseInt(req.user.id);
    
    let keysToDelete = [];

    // Delete all tokens related to that user
    let cursor = 0;
    do {
        const reply = await redis_client.scan(cursor, {
            MATCH: "token:*",
            COUNT: 100
        });

        cursor = parseInt(reply.cursor);
        const keys = reply.keys;

        for (const key of keys) {
            const value = await redis_client.get(key);

            try {
                if (parseInt(value) === userId) {
                    keysToDelete.push(key);
                }
            } catch (err) {
                console.error(err);
            }
        }
    } while (cursor !== 0);

    if(keysToDelete.length > 0) {
        await redis_client.del(keysToDelete);
    }

    const newUser = await get_user(req.user.id);

    if (!newUser) {
        return res.status(500).json({
            error: "Error fetching new user"
        });
    }

    res.status(200).json({
        data: newUser
    });
});

export default app;
