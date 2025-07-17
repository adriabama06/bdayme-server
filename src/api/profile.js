import { Router } from "express";
import { create_profile, get_profile, update_profile } from "../controller/profile.js";
import middleware_auth from "../middlewares/auth.js";

const app = Router();

app.get("/:id", async (req, res) => {
    const { id } = req.params;

    const profile = await get_profile(id);

    if(!profile) {
        return res.status(404).json({
            error: "Profile not found"
        });
    }

    res.status(200).json(profile);
});

app.post("/create", middleware_auth, async (req, res) => {
    const { username, birthday } = req.body;

    if(typeof username != "string" || typeof birthday != "string" || isNaN(new Date(birthday))) {
        return res.status(400).json({
            error: "Body must be a JSON with { username: string, birthday: string }, for birthday use `new Date(year, month, day).toISOString()`"
        });
    }

    const profile = await create_profile(req.user.id, username, new Date(birthday));

    if(!profile) {
        return res.status(500).json({
            error: `Error creating profile`
        });
    }

    res.status(200).json(profile);
});

app.post("/update/:option", middleware_auth, async (req, res) => {
    const { option } = req.params;

    if(!["username", "birthday"].includes(option)) {
        return res.status(400).json({
            error: "Invalid option to update"
        });
    }

    let value = req.body[option]; // TODO: Use key, value for multiple patch in a single request

    if(option == "birthday") {
        const value_date = new Date(value);

        if(isNaN(value_date)) {
            return res.status(400).json({
                error: "Birthday is not a valid date, try using: `new Date(year, month, day).toISOString()`"
            });
        }

        value = value_date;
    }

    const profile = await update_profile(req.user.id, option, value);

    if(!profile) {
        return res.status(500).json({
            error: `Error on updating the value "${req.body[option]}" in option ${option}`
        });
    }

    res.status(200).json(profile);
});

export default app;
