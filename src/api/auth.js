import { Router } from "express";
import { v4 as uuid_v4 } from "uuid";
import crypto from "crypto";

import { create_user, get_user_by } from "../controller/user.js";
import middleware_auth from "../middlewares/auth.js";
import rate_limit from "../middlewares/rate_limit.js";
import redis_client from "../redis.js";

const app = Router();

// Brute force / abuse protection, limits configurable from env
const register_limiter = rate_limit({
    window_ms: 60 * 60 * 1000,
    max: parseInt(process.env.REGISTER_RATE_LIMIT_MAX) || 10
});

const login_limiter = rate_limit({
    window_ms: 15 * 60 * 1000,
    max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX) || 5
});

app.post("/register", register_limiter, async (req, res) => {
    const { username, password } = req.body;

    if(typeof username != "string" || typeof password != "string") {
        return res.status(400).json({
            error: "Body must be a JSON with { username: string, password: string }"
        });
    }

    if(username.length > 64 || password.length > 255 || username.length < 5 || password.length < 8) {
        return res.status(400).json({
            error: "Username and password can't be more than 255 charecters or username can't be shorter than 5 and password can't be shorter than 8 char"
        });
    }

    if(await get_user_by("username", username) != undefined) {
        return res.status(400).json({
            error: "Username already in use"
        });
    }

    const user = await create_user(username, password);

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

app.post("/login", login_limiter, async (req, res) => {
    const { username, password } = req.body;

    if(typeof username != "string" || typeof password != "string") {
        return res.status(400).json({
            error: "Body must be a JSON with { username: string, password: string }"
        });
    }

    if(username.length > 64 || password.length > 255 || username.length < 5 || password.length < 8) {
        return res.status(400).json({
            error: "Username and password can't be more than 255 charecters or username can't be shorter than 5 and password can't be shorter than 8 char"
        });
    }

    const user = await get_user_by("username", username);

    // Same response whether the user does not exist or the password is wrong
    // to prevent user enumeration
    if(!user || user.password != crypto.createHash('sha256').update(password).digest('hex')) {
        return res.status(400).json({
            error: "Invalid username or password"
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
        data: { ...user, token }
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
