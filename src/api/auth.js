import { Router } from "express";
import { create_user, get_user_by } from "../controller/user.js";
import middleware_auth from "../middlewares/auth.js";

const app = Router();

app.post("/register", async (req, res) => {
    const { username, email, password } = req.body;

    if(typeof username != "string" || typeof email != "string" || typeof password != "string") {
        return res.status(400).json({
            error: "Body must be a JSON with { username: string, email: string, password: string }"
        });
    }

    if(username.length > 64 || email.length > 255 || password.length > 255) {
        return res.status(400).json({
            error: "Username can only have up to 64 charecters and email only up to 255"
        });
    }

    if(await get_user_by("username", username) != undefined || await get_user_by("email", email) != undefined) {
        return res.status(400).json({
            error: "Username or email already in use"
        });
    }

    // TODO: Hash password

    const user = await create_user(username, email, password);

    if(!user) {
        return res.status(500).json({
            error: "Error on register user in the server"
        });
    }

    delete user.password;

    // TODO: Maybe pre generae a token to directly auth the user?
    res.status(200).json(user);
});

app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    if(typeof email != "string" || typeof password != "string") {
        return res.status(400).json({
            error: "Body must be a JSON with { email: string, password: string }"
        });
    }

    if(email.length > 255 || password.length > 255) {
        return res.status(400).json({
            error: "Username can only have up to 64 charecters and email only up to 255"
        });
    }

    // TODO: Hash password

    const user = await get_user_by("email", email);

    if(!user) {
        return res.status(400).json({
            error: "This user not exist"
        });
    }

    if(user.password != password) {
        return res.status(400).json({
            error: "Incorrect password"
        });
    }

    delete user.password;

    // TODO: Generate token to store in redis
    res.status(200).json(user);
});

app.post("/logout", middleware_auth, async (req, res) => {
    const authorization = req.headers.authorization;

    // TODO: Remove from redis the entry

    const status = "ok"; // await redis.delete ?

    if(status == "bad") {
        return res.status(500).json({
            error: "Internal error on try to logout this account"
        });
    }

    // TODO: Generate token to store in redis
    res.status(204).end();
});

export default app;
