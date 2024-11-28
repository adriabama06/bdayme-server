import { Router } from "express";
import { get_user } from "../controller/user.js";

const app = Router();

app.get("/:id", async (req, res) => {
    const { id } = req.params;

    const user = await get_user(id);

    if(!user) {
        return res.status(404).json({
            error: "User not found"
        });
    }

    delete user.password;
    delete user.email;

    res.status(200).json(user);
});

export default app;
