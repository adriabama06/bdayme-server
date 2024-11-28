import redis from "redis";

const client = redis.createClient({
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT),
});

client.on("connect", () => {
    console.log("[REDIS] Connected to Redis");
});

client.on("error", (err) => {
    console.error("[REDIS] Error:", err);
    console.log("[REDIS] Exiting...");
    process.exit();
});

export default client;
