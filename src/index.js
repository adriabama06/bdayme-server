import dotenv from "dotenv";
dotenv.config();

const PORT = process.env.PORT ?? 80;

import express from "express";

const app = express();
app.use(express.json());

import user_api from "./api/users.js";
import auth_api from "./api/auth.js";
import profile_api from "./api/profile.js";
import friends_api from "./api/friends.js";

app.use("/users", user_api);
app.use("/auth", auth_api);
app.use("/profile", profile_api);
app.use("/friends", friends_api);

app.use((req, res) => {
    res.send("Hello World");
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`[HTTP] Server ready at :${PORT}`);
});
