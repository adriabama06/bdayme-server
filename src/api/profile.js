import { Router } from "express";
import { create_profile, get_profile, update_profile } from "../controller/profile.js";
import middleware_auth from "../middlewares/auth.js";

const MAX_ABOUTME_LENGTH = 1024;

const app = Router();

app.get("/", middleware_auth, async (req, res) => {
    const profile = await get_profile(req.user.id);

    if(!profile) {
        return res.status(404).json({
            error: "Profile not found"
        });
    }

    res.status(200).json({
        data: profile
    });
});

app.get("/:id", async (req, res) => {
    if(isNaN(parseInt(req.params.id))) {
        return res.status(400).json({
            error: "Id must be a int"
        });
    }

    const id = parseInt(req.params.id);

    const profile = await get_profile(id);

    if(!profile) {
        return res.status(404).json({
            error: "Profile not found"
        });
    }

    res.status(200).json({
        data: profile
    });
});

app.post("/create", middleware_auth, async (req, res) => {
    const { username, birthday } = req.body;

    if(typeof username != "string" || typeof birthday != "string" || isNaN(new Date(birthday))) {
        return res.status(400).json({
            error: "Body must be a JSON with { username: string, birthday: string }, for birthday use `new Date(year, month, day).toISOString()`"
        });
    }

    if(username.length <= 0) {
        return res.status(400).json({
            error: "Username can't be a empty string"
        });
    }

    const profile = await create_profile(req.user.id, username, new Date(birthday));

    if(!profile) {
        return res.status(500).json({
            error: `Error creating profile`
        });
    }

    res.status(200).json({
        data: profile
    });
});

app.post("/update/:option", middleware_auth, async (req, res) => {
    const { option } = req.params;

    if(!["username", "birthday", "aboutme"].includes(option)) {
        return res.status(400).json({
            error: "Invalid option to update"
        });
    }

    let value = req.body[option]; // TODO: Use key, value for multiple patch in a single request

    if(!value) {
        return res.status(400).json({
            error: "There is no value to update"
        });
    }

    if(option == "birthday") {
        const value_date = new Date(value);

        if(isNaN(value_date)) {
            return res.status(400).json({
                error: "Birthday is not a valid date, try using: `new Date(year, month, day).toISOString()`"
            });
        }

        value = value_date;
    }

    if(option === "aboutme") {
        if(typeof value !== "string") {
            return res.status(400).json({
                error: "The input must be a string"
            });
        }

        if(value.length >= MAX_ABOUTME_LENGTH) {
            value = value.slice(0, MAX_ABOUTME_LENGTH);
        }
    }

    const profile = await update_profile(req.user.id, option, value);

    if(!profile) {
        return res.status(500).json({
            error: `Error on updating the value "${req.body[option]}" in option ${option}`
        });
    }

    res.status(200).json({
        data: profile
    });
});

export default app;
