import dotenv from "dotenv";
dotenv.config();

const PORT = process.env.PORT ?? 80;

import express from "express";

const app = express();
app.use(express.json());
app.set('trust proxy', process.env.TRUST_PROXY?.split(",") ?? []); // https://expressjs.com/en/guide/behind-proxies.html

app.get("/healthcheck", (req, res) => {
    res.status(200).json({
        data: "Server up!"
    });
});

// Check client version
app.use((req, res, next) => {
    const client_version = req.headers["client-version"];

    if(client_version === undefined) {
        return res.status(400).json({
            error: "Your client is outdated, your version might be lower than 0.9.0, so, is not compatible with the current version of the API"
        });
    }

    if(client_version === "custom") {
        return next();
    }

    const [top, med, low] = client_version.split(".");

    // 0.9.0
    if(top <= 0 && med <= 9 && low <= 0) {
        return res.status(400).json({
            error: "The client version 0.9.0 or lower is not compatible with this API version"
        });
    }

    next();
});

import user_api from "./api/user.js";
import auth_api from "./api/auth.js";
import profile_api from "./api/profile.js";
import friends_api from "./api/friends.js";
import code_api from "./api/code.js";

app.use("/auth", auth_api);
app.use("/user", user_api);
app.use("/profile", profile_api);
app.use("/friends", friends_api);
app.use("/code", code_api);

app.use((req, res) => {
    res.status(404).json({ error: "Oh, this page does not exist, what are you looking for?" });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`[HTTP] Server ready at :${PORT}`);
});
