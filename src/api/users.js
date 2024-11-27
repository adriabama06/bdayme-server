import { Router } from "express";

const app = Router();

app.post("/", async (req, res) => {
    const { user, password } = req.body;

    if(!user || !password || typeof user != "string" || typeof password != "string") {
        return res.status(400).json({
            data: `Body must be a JSON with { user: string, password: string }`
        });
    }

    // if user exist -> Error

    // hash password

    // add user

    // return ok to client!
});

app.get("/:user_id");

export default app;