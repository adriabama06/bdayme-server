import { Router } from "express";
import { create_profile, get_profile, is_valid_option_profile, parse_value_from_option_profile, update_profile } from "../controller/profile.js";
import middleware_auth from "../middlewares/auth.js";
import middleware_valid_id from "../middlewares/valid_id.js";

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

app.get("/:id", middleware_auth, middleware_valid_id, async (req, res) => {
    const profile = await get_profile(req.validated_id);

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
    const { display_name, birthday } = req.body;

    if(typeof display_name != "string" || typeof birthday != "string" || isNaN(new Date(birthday))) {
        return res.status(400).json({
            error: "Body must be a JSON with { display_name: string, birthday: string }, for birthday use `new Date(year, month, day).toISOString()`"
        });
    }

    if(display_name.length <= 0 || display_name.length > 64) {
        return res.status(400).json({
            error: "Display name can't be a empty string or bigger than 64 charecters"
        });
    }

    const profile = await create_profile(req.user.id, display_name, new Date(birthday));

    if(!profile) {
        return res.status(500).json({
            error: `Error creating profile`
        });
    }

    res.status(200).json({
        data: profile
    });
});

app.post("/update", middleware_auth, async (req, res) => {
    const data = req.body;

    for (const key in data) {
        if(!is_valid_option_profile(key)) {
            return res.status(400).json({
                error: `Invalid option to update: ${key}`
            });
        }

        let value = parse_value_from_option_profile(key, data[key]);

        if(value === undefined) {
            return res.status(400).json({
                error: "Invalid value to update, wrong type or wrong input."
            });
        }

        const profile = await update_profile(req.user.id, key, value);

        if(!profile) {
            return res.status(500).json({
                error: `Error on updating the value "${data[key]}" as "${value}" in option ${key}`
            });
        }
    }

    const new_profile = await get_profile(req.user.id);

    if(!new_profile) {
        return res.status(500).json({
            error: `Unknown error trying to get your new profile`
        });
    }

    res.status(200).json({
        data: new_profile
    });
});

export default app;
