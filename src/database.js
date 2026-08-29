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

// NOTE: no migrations here. Migrating on every connect is unsafe with
// replicas (all of them race the same ALTER TABLE and one can die with
// process.exit(1)). Database updates are applied by
// `scripts/check_database_update.js` BEFORE the replicas start:
//   - npm run db:update            (local)
//   - docker compose run --rm dbmigrate / scripts/deploy.sh  (Docker)
pg_client.on("connect", () => {
    console.log("[PG] Connected to Postgres");
});

pg_client.on("error", (err) => {
    console.error("[PG] Error:", err);
    console.log("[PG] Exiting...");
});

export default pg_client;
