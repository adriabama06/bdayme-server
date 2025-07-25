import dotenv from "dotenv";
dotenv.config();

const PORT = process.env.PORT ?? 80;

import express from "express";

const app = express();
app.use(express.json());
app.set('trust proxy', process.env.TRUST_PROXY?.split(",") ?? []); // https://expressjs.com/en/guide/behind-proxies.html

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
    res.send("Hello World");
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`[HTTP] Server ready at :${PORT}`);
});
