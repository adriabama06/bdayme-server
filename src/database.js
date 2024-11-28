import { Pool } from "pg";

const pool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT),
    database: process.env.POSTGRES_DATABASE,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
});

pool.on("connect", () => {
    console.log("[PG] Connected to Postgres");
});

pool.on("error", (err) => {
    console.error("[PG] Error:", err);
    console.log("[PG] Exiting...");
});

export default pool;
