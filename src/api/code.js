import { Router } from "express";
import { v4 as uuid_v4 } from "uuid";

import { get_user } from "../controller/user.js";
import { create_friend, delete_friend, get_friends, has_friend } from "../controller/friends.js";
import middleware_auth from "../middlewares/auth.js";
import redis_client from "../redis.js";

const app = Router();

app.post("/create", middleware_auth, async (req, res) => {
    const code = uuid_v4();

    try {
        await redis_client.set(`code:${code}`, req.user.id, { EX: 10 * 60, NX: true });
    } catch {
        return res.status(500).json({
            error: "Error creating code to your account"
        });
    }

    const url = new URL(`${req.protocol}://${req.get("host")}${req.originalUrl}`);

    res.status(200).json({
        data: {
            code,
            direct_url: `${url.origin}/code/accept/${code}`
        }
    });
});

app.get("/accept/:code", middleware_auth, async (req, res) => {
    const { code } = req.params;

    try {
        const id = await redis_client.get(`code:${code}`);

        if(!id) {
            return res.status(400).json({
                error: "Invalid code"
            });
        }

        const friend = await create_friend(id, req.user.id);

        if(!friend) {
            return res.status(500).json({
                error: "Error adding friend"
            });
        }

        await redis_client.del(`code:${code}`);

        res.status(204).end();
    } catch {
        return res.status(500).json({
            error: "Error getting the code or expierd"
        });
    }
});

export default app;
