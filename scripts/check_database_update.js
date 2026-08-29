#!/usr/bin/env node
/**
 * Database update script: checks the schema and applies the changes needed for
 * this version of the API. Replaces the migrations that used to run on every
 * connect in src/database.js (unsafe with replicas: all of them raced the same
 * ALTER TABLE on boot and one could die with process.exit(1)).
 *
 * Usage:
 *   npm run db:update                  apply pending updates
 *   npm run db:update -- --check       only report, change nothing
 *   docker compose run --rm dbmigrate  same, inside Docker (also run by deploy.sh)
 *
 * Safe to run while the replicas are up:
 *   - takes a Postgres advisory lock, so two concurrent runs can't interleave
 *   - every pending change is applied inside one transaction (all or nothing)
 *   - idempotent: already applied steps are detected and skipped
 *   - --check only runs reads
 */

import dotenv from "dotenv";
dotenv.config();

import pg from "pg";
import { MAX_ABOUTME_LENGTH } from "../src/constants.js";

// How long to wait for the migration lock before giving up (ms)
const LOCK_WAIT_MS = parseInt(process.env.MIGRATION_LOCK_WAIT_MS) || 60_000;

// Fixed id for the "only one database update at a time" advisory lock ("bday" in ASCII)
const MIGRATION_LOCK_ID = 0x62646179;

/**
 * @typedef {object} Migration
 * @prop {string} name Human readable id of the step
 * @prop {(client: pg.Client) => Promise<boolean>} detect True when the change is still missing
 * @prop {(client: pg.Client) => Promise<void>} apply The change itself (only runs when detect() was true)
 */

/** @type {Migration[]} */
const MIGRATIONS = [
    {
        name: "rename 'email' to 'username' in 'users' (strip everything after '@')",
        detect: async (client) => {
            const res = await client.query(`
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'users' AND column_name = 'email';
            `);

            return res.rows.length > 0;
        },
        apply: async (client) => {
            await client.query(`
                ALTER TABLE users
                RENAME COLUMN email TO username;
            `);

            await client.query(`
                UPDATE users
                SET username = split_part(username, '@', 1);
            `);
        }
    },
    {
        name: "rename 'username' to 'display_name' in 'profiles'",
        detect: async (client) => {
            const res = await client.query(`
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'profiles' AND column_name = 'username';
            `);

            return res.rows.length > 0;
        },
        apply: async (client) => {
            await client.query(`
                ALTER TABLE profiles
                RENAME COLUMN username TO display_name;
            `);
        }
    },
    {
        name: `add 'aboutme' VARCHAR(${MAX_ABOUTME_LENGTH}) to 'profiles'`,
        detect: async (client) => {
            const res = await client.query(`
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'profiles' AND column_name = 'aboutme';
            `);

            return res.rows.length === 0;
        },
        apply: async (client) => {
            await client.query(`
                ALTER TABLE profiles
                ADD COLUMN aboutme VARCHAR(${MAX_ABOUTME_LENGTH}) NOT NULL DEFAULT '';
            `);
        }
    }
];

/**
 * Try to take the migration advisory lock, retrying for LOCK_WAIT_MS.
 * @returns {Promise<boolean>} true when the lock was acquired
 */
async function acquire_lock(client) {
    const deadline = Date.now() + LOCK_WAIT_MS;

    for(;;) {
        const res = await client.query("SELECT pg_try_advisory_lock($1) AS locked;", [MIGRATION_LOCK_ID]);

        if(res.rows[0].locked) return true;

        if(Date.now() >= deadline) return false;

        console.log("[DB] The migration lock is taken (another update is running?), waiting...");
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

async function main() {
    const check_only = process.argv.includes("--check");

    const pg_client = new pg.Client({
        host: process.env.POSTGRES_HOST,
        port: parseInt(process.env.POSTGRES_PORT),
        database: process.env.POSTGRES_DATABASE,
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
    });

    console.log(`[DB] Connecting to '${process.env.POSTGRES_DATABASE}' at ${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}${check_only ? " (--check, read only)" : ""}`);
    await pg_client.connect();

    if(!(await acquire_lock(pg_client))) {
        console.error(`[DB] Another database update is still running (waited ${LOCK_WAIT_MS / 1000}s for the lock), aborting.`);
        await pg_client.end();
        process.exit(1);
    }

    try {
        // Detect what is pending (only reads)
        const pending = [];

        for(const migration of MIGRATIONS) {
            if(await migration.detect(pg_client)) {
                pending.push(migration);
            }
            else {
                console.log(`[DB] Up to date - ${migration.name}`);
            }
        }

        if(pending.length === 0) {
            console.log("[DB] Database is up to date for this version, nothing to do.");
            return;
        }

        if(check_only) {
            console.log(`[DB] ${pending.length} pending update(s):`);
            for(const migration of pending) {
                console.log(`[DB]   - ${migration.name}`);
            }
            console.log("[DB] Check only, nothing was changed. Run without --check to apply.");
            return;
        }

        // Apply everything in one transaction: either all changes or none
        await pg_client.query("BEGIN");
        try {
            for(const migration of pending) {
                await migration.apply(pg_client);
                console.log(`[DB] Applied - ${migration.name}`);
            }

            await pg_client.query("COMMIT");
        }
        catch(err) {
            await pg_client.query("ROLLBACK");
            throw err;
        }

        console.log(`[DB] Database updated: ${pending.length} change(s) applied.`);
    }
    finally {
        await pg_client.query("SELECT pg_advisory_unlock($1);", [MIGRATION_LOCK_ID]).catch(() => {});
        await pg_client.end();
    }
}

main().catch(err => {
    console.error("[DB] Database update failed:", err);
    process.exit(1);
});
