import { Router } from "express";
import { v4 as uuid_v4 } from "uuid";
import crypto from "crypto";

import { create_user, get_user_by } from "../controller/user.js";
import middleware_auth from "../middlewares/auth.js";
import redis_client from "../redis.js";

const app = Router();

app.post("/register", async (req, res) => {
    const { email, password } = req.body;

    if(typeof email != "string" || typeof password != "string") {
        return res.status(400).json({
            error: "Body must be a JSON with { email: string, password: string }"
        });
    }

    if(email.length > 255 || password.length > 255 || email.length < 5 || password.length < 8) {
        return res.status(400).json({
            error: "Email and password can't be more than 255 charecters or email can't be shorter than 5 and password can't be shorter than 8 char"
        });
    }

    if(await get_user_by("email", email) != undefined) {
        return res.status(400).json({
            error: "Email already in use"
        });
    }

    const user = await create_user(email, password);

    if(!user) {
        return res.status(500).json({
            error: "Error on register user in the server"
        });
    }

    delete user.password;

    res.status(200).json({
        data: user
    });
});

app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    if(typeof email != "string" || typeof password != "string") {
        return res.status(400).json({
            error: "Body must be a JSON with { email: string, password: string }"
        });
    }

    if(email.length > 255 || password.length > 255 || email.length < 5 || password.length < 8) {
        return res.status(400).json({
            error: "Email and password can't be more than 255 charecters or email can't be shorter than 5 and password can't be shorter than 8 char"
        });
    }

    const user = await get_user_by("email", email);

    if(!user) {
        return res.status(400).json({
            error: "This user not exist"
        });
    }

    if(user.password != crypto.createHash('sha256').update(password).digest('hex')) {
        return res.status(400).json({
            error: "Incorrect password"
        });
    }

    const token = uuid_v4();

    const status = await redis_client.set(`token:${token}`, user.id, { EX: 90 * 24 * 3600, NX: true });

    if(!status) {
        return res.status(500).json({
            error: "Error creating token"
        });
    }

    delete user.password;

    res.setHeaders(new Headers({ "Authorization": `Bearer ${token}` }));
    res.status(200).json({
        data: user
    });
});

app.post("/logout", middleware_auth, async (req, res) => {
    const token = req.token;

    const status = await redis_client.del(`token:${token}`);

    if(status < 1) {
        return res.status(500).json({
            error: "Internal error on try to logout this account"
        });
    }

    res.status(204).end();
});

export default app;
