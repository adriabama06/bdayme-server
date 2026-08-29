import dotenv from "dotenv";
dotenv.config();

import redis from "redis";
import { is_shutting_down } from "./lifecycle.js";

const redis_client = redis.createClient({
    socket: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT)
    }
});

redis_client.connect();

redis_client.on("connect", () => {
    console.log("[REDIS] Connected to Redis");
});

redis_client.on("error", (err) => {
    // While the process is draining (SIGTERM), errors are expected: the
    // shutdown flow closes this client itself and must not be killed here.
    if(is_shutting_down()) {
        return console.error("[REDIS] Error (shutting down):", err);
    }

    console.error("[REDIS] Error:", err);
    console.log("[REDIS] Exiting...");
    process.exit();
});

export default redis_client;
