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

    res.status(200).json({
        data: user
    });
});

export default app;
