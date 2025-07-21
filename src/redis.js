import dotenv from "dotenv";
dotenv.config();

import redis from "redis";

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
    console.error("[REDIS] Error:", err);
    console.log("[REDIS] Exiting...");
    process.exit();
});

export default redis_client;
