# bdayme-server
bdayme app backend

## Deployment (Docker)

- Reverse proxy: **Traefik** (replaces nginx). Same external contract as before: clients call `http://<host>:6570/api/v0/...`, Traefik strips the `/api/v0` prefix and forwards to the `server` containers. Client headers pass through untouched (Host, Client-Version, Authorization, helmet response headers...) and the proxy adds `X-Real-Ip`, `X-Forwarded-For`, `X-Forwarded-Proto` and handles WebSocket upgrades, like nginx did. `TRUST_PROXY` accepts docker service names (`traefik`): the server resolves them via docker DNS and re-resolves every 30s in case the proxy IP changes.
- `./scripts/deploy.sh` builds the image, updates the database once and starts the stack with **3 `server` replicas** behind Traefik. Change the count with `REPLICAS=5 ./scripts/deploy.sh`. Traefik round-robins across the replicas and stops routing to unhealthy ones.
- Database updates are **not** run by the server on boot anymore (with replicas they would race each other). Instead:
  - `npm run db:update` (or `node scripts/check_database_update.js`): applies pending updates. Safe with replicas: it takes a Postgres advisory lock, applies everything in one transaction and skips already applied steps.
  - `npm run db:check`: preview pending updates without changing anything (`--check`).
  - In Docker it also runs automatically as the one-shot `dbmigrate` service before the replicas start (both in `deploy.sh` and in a plain `docker compose up -d`).
- Graceful shutdown: on `SIGTERM` (docker stop / scale down / redeploy) the server stops accepting new requests, answers `503` on `/healthcheck`, lets in-flight requests finish (up to `SHUTDOWN_TIMEOUT_MS`, default 30s) and then closes Postgres/Redis. The compose `stop_grace_period` (45s) is deliberately higher so nothing gets SIGKILLed mid-request.

### Multiple servers

The API is stateless (auth tokens, rate limits and caches live in Postgres/Redis), so replicas need no sticky sessions. `scripts/deploy.sh` scales on a single host; for a distributed setup across several servers, point every `server` instance to the same Postgres/Redis and put a load balancer in front of them (Traefik's Docker provider only discovers containers on its own host). TODO WebSockets will need sticky sessions or a Redis pub/sub layer first.

## Tests

- `npm test`: unit + API tests (no database/redis needed, they are mocked with the Node.js built-in test runner)
- `npm run test:e2e -- -- <base_url>`: full E2E test of the friends system against a deployed backend (creates 2 accounts, adds them as friends, checks both sides can see the info, logs out and prints a SQL command to remove the test accounts). Defaults to `http://127.0.0.1:6570`, or set `TEST_URL`.

TODO:
- Change ' to " for strings that are not a single char (like in C/C++) + Typo fix (like remove usage of `` when is not required, or change from == to ===)
- Leave ID as number, do not use number | string to clear what is the ID
- Clear code
- Add WebSockets to enhance the client/server comunication
