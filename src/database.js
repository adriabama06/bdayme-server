import dotenv from "dotenv";
dotenv.config();

import { MAX_ABOUTME_LENGTH } from "./controller/profile";

import pg from "pg";

const pg_client = new pg.Client({
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT),
    database: process.env.POSTGRES_DATABASE,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
});

pg_client.connect();

pg_client.on("connect", async () => {
    console.log("[PG] Connected to Postgres");
    console.log("[PG] Checking if the database is updated for this version.");

    // add-aboutme
    try {
        const res = await pg_client.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'profiles' AND column_name = 'aboutme';
        `);

        if (res.rows.length === 0) {
            console.log("[DB] 'aboutme' does not exists in 'profiles', it will be created.");

            await pg_client.query(`
                ALTER TABLE profiles
                ADD COLUMN aboutme VARCHAR(${MAX_ABOUTME_LENGTH}) NOT NULL DEFAULT '';
            `);

            console.log("[DB] 'aboutme' has been created");
        }
    } catch (err) {
        console.log("[PG] Error checking or creating if the 'aboutme' exists in 'profiles'.");
        console.error(err);

        // Stop the code because can't know if database is ok.
        process.exit(1);
    }

    console.log("[PG] All ok.");
});

pg_client.on("error", (err) => {
    console.error("[PG] Error:", err);
    console.log("[PG] Exiting...");
});

export default pg_client;
