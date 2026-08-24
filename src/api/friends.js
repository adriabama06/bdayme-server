import { Router } from "express";
import { get_user } from "../controller/user.js";
import { create_friend, delete_friend, get_friends, has_friend } from "../controller/friends.js";
import middleware_auth from "../middlewares/auth.js";
import middleware_valid_id from "../middlewares/valid_id.js";

const app = Router();

app.get("/", middleware_auth, async (req, res) => {
    const friends = await get_friends(req.user.id);

    if(!friends) {
        return res.status(500).json({
            error: "Can't get your friends"
        });
    }

    res.status(200).json({
        data: friends
    });
});

app.get("/has/:id", middleware_auth, middleware_valid_id, async (req, res) => {
    // Yes, I know I can use the list and do a `for` to search if it has or not, but is to incrase the low SQL usage in this code 
    // maybe in the future I will change this code to what I said
    const is_ok = await has_friend(req.user.id, req.validated_id);

    if(is_ok == undefined) {
        return res.status(500).json({
            error: "Error checking the information"
        });
    }

    res.status(200).json({
        data: is_ok
    });
});

app.post("/add/:id", middleware_auth, middleware_valid_id, async (req, res) => {
    const friend = await create_friend(req.user.id, req.validated_id);

    if(!friend) {
        return res.status(500).json({
            error: "Error adding your friend"
        });
    }

    res.status(200).json({
        data: friend
    });
});

app.post("/remove/:id", middleware_auth, middleware_valid_id, async (req, res) => {
    const friend = await delete_friend(req.user.id, req.validated_id);

    if(!friend) {
        return res.status(500).json({
            error: "Error removing your friend"
        });
    }

    res.status(200).json({
        data: friend
    });
});

export default app;
