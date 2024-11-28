import dotenv from "dotenv";
dotenv.config();

import pg from "pg";

const pg_client = new pg.Client({
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT),
    database: process.env.POSTGRES_DATABASE,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
});

pg_client.connect();

pg_client.on("connect", () => {
    console.log("[PG] Connected to Postgres");
});

pg_client.on("error", (err) => {
    console.error("[PG] Error:", err);
    console.log("[PG] Exiting...");
});

export default pg_client;
