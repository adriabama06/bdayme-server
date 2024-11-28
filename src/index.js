import dotenv from "dotenv";
dotenv.config();

const PORT = process.env.PORT ?? 80;

import express from "express";

const app = express();
app.use(express.json());

import userApi from "./api/users.js";

app.use("/users", userApi);

app.use((req, res) => {
    res.send("Hello World");
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`[HTTP] Server ready at :${PORT}`);
});
