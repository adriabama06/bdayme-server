import { Router } from "express";
import { get_user, update_user } from "../controller/user.js";
import middleware_auth from "../middlewares/auth.js";

const app = Router();

app.get("/", middleware_auth, async (req, res) => {
    delete req.user.password;

    res.status(200).json({
        data: req.user
    });
});

app.post("/update", middleware_auth, async (req, res) => {
    const data = req.body;

    if (typeof data.email !== "string" || typeof data.password !== "string" || email.length > 255 || password.length > 255) {
        return res.status(400).json({
            error: "Email & Password must be a string"
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
