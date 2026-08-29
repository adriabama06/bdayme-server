import dotenv from "dotenv";
dotenv.config();

const PORT = process.env.PORT ?? 80;

// Max time (ms) in-flight requests have to finish after SIGTERM/SIGINT before
// the remaining connections are force-closed. Keep it below the
// stop_grace_period of the `server` service in compose.yml (45s).
const SHUTDOWN_TIMEOUT_MS = parseInt(process.env.SHUTDOWN_TIMEOUT_MS) || 30_000;

import express from "express";
import cors from "cors";
import helmet from "helmet";

import pg_client from "./database.js";
import redis_client from "./redis.js";
import { mark_shutting_down } from "./lifecycle.js";
import setup_trust_proxy from "./trust_proxy.js";

const app = express();
app.use(express.json());
app.use(helmet()); // Secure HTTP headers (CSP, nosniff, X-Frame-Options, HSTS, Referrer-Policy...)
await setup_trust_proxy(app); // Resolves TRUST_PROXY entries like "traefik" to their docker IPs (and re-resolves on change)

// Only allow the origins listed in CORS_ORIGIN (comma separated), block everyone else
const cors_origins = process.env.CORS_ORIGIN?.split(",").map(origin => origin.trim()).filter(origin => origin.length > 0) ?? [];

if(cors_origins.length === 0) {
    console.warn("[CORS] CORS_ORIGIN is not set, all browser origins will be blocked");
}

app.use(cors({
    origin: (origin, callback) => {
        // Requests without Origin (curl, mobile apps, same-origin) are allowed,
        // browsers always send it on cross-origin requests
        if(!origin || cors_origins.includes(origin)) return callback(null, true);

        return callback(null, false);
    }
}));

// Set to true as soon as a shutdown signal arrives, so the healthcheck can
// tell the load balancer / container healthcheck to stop routing new traffic
// here while the in-flight requests are draining.
let shutting_down = false;

app.get("/healthcheck", (req, res) => {
    if(shutting_down) {
        return res.status(503).json({
            data: "Server is shutting down"
        });
    }

    res.status(200).json({
        data: "Server up!"
    });
});

// Check client version
app.use((req, res, next) => {
    const client_version = req.headers["client-version"];

    if(client_version === undefined) {
        return res.status(400).json({
            error: "Your client is outdated, your version might be lower than 0.9.0, so, is not compatible with the current version of the API"
        });
    }

    if(client_version === "custom") {
        return next();
    }

    const [top, med, low] = client_version.split(".");

    // 0.9.0
    if(top <= 0 && med <= 9 && low <= 0) {
        return res.status(400).json({
            error: "The client version 0.9.0 or lower is not compatible with this API version"
        });
    }

    next();
});

import user_api from "./api/user.js";
import auth_api from "./api/auth.js";
import profile_api from "./api/profile.js";
import friends_api from "./api/friends.js";
import code_api from "./api/code.js";

app.use("/auth", auth_api);
app.use("/user", user_api);
app.use("/profile", profile_api);
app.use("/friends", friends_api);
app.use("/code", code_api);

app.use((req, res) => {
    res.status(404).json({ error: "Oh, this page does not exist, what are you looking for?" });
});

const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`[HTTP] Server ready at :${PORT}`);
});

/**
 * Resolves once every open connection is done, force-closing the stragglers
 * (long requests, dead sockets) after SHUTDOWN_TIMEOUT_MS.
 */
function wait_for_drain() {
    return new Promise((resolve) => {
        const force_timer = setTimeout(() => {
            console.log("[HTTP] Shutdown timeout reached, force-closing remaining connections");
            server.closeAllConnections();
            resolve();
        }, SHUTDOWN_TIMEOUT_MS);

        server.close(() => {
            clearTimeout(force_timer);
            resolve();
        });
    });
}

function with_timeout(promise, ms, message) {
    let timer;

    return Promise.race([
        promise,
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(message)), ms);
        })
    ]).finally(() => clearTimeout(timer));
}

async function close_pg() {
    try {
        await with_timeout(pg_client.end(), 5_000, "[PG] Closing the connection timed out");
        console.log("[PG] Connection closed");
    }
    catch(err) {
        console.error("[PG] Error closing connection:", err);
    }
}

async function close_redis() {
    try {
        await with_timeout(redis_client.quit(), 5_000, "[REDIS] Closing the connection timed out");
        console.log("[REDIS] Connection closed");
    }
    catch(err) {
        console.error("[REDIS] Error closing connection:", err);
    }
}

/**
 * Graceful shutdown on docker stop / scale down / Ctrl+C:
 * 1. stop accepting new requests and answer 503 on /healthcheck
 * 2. let the in-flight requests finish (up to SHUTDOWN_TIMEOUT_MS)
 * 3. close the Postgres/Redis connections
 */
async function graceful_shutdown(signal) {
    if(shutting_down) {
        // A second signal means "don't wait": drop everything now
        console.log(`[HTTP] ${signal} received again, force-closing now`);
        server.closeAllConnections();
        return process.exit(0);
    }

    shutting_down = true;
    mark_shutting_down(); // database/redis error handlers must not process.exit() while closing

    console.log(`[HTTP] ${signal} received, draining connections (max ${SHUTDOWN_TIMEOUT_MS} ms)...`);

    // Stop accepting new connections. closeIdleConnections() drops the
    // keep-alive connections that are not handling a request, so the drain
    // finishes as soon as the in-flight requests do.
    server.close();
    server.closeIdleConnections();

    await wait_for_drain();

    await Promise.allSettled([close_pg(), close_redis()]);

    console.log("[HTTP] Shutdown complete, bye");
    process.exit(0);
}

process.on("SIGTERM", () => graceful_shutdown("SIGTERM"));
process.on("SIGINT", () => graceful_shutdown("SIGINT"));
