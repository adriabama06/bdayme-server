#!/usr/bin/env bash
#
# Deploy / update the bdayme stack:
#   1. builds the server image
#   2. starts db + redis and waits until they are healthy
#   3. runs the database migrations exactly ONCE (the one-shot `dbmigrate`
#      service runs scripts/check_database_update.js before any replica starts)
#   4. brings the whole stack up with N `server` replicas behind Traefik
#      (Traefik load-balances them round-robin automatically)
#
# Usage:
#   ./scripts/deploy.sh              # 3 replicas (default)
#   REPLICAS=5 ./scripts/deploy.sh   # any other number of replicas
#
set -euo pipefail
cd "$(dirname "$0")/.."

REPLICAS="${REPLICAS:-3}"

echo "[deploy] Building the server image..."
docker compose build server dbmigrate

echo "[deploy] Starting db + redis, waiting until they are healthy..."
docker compose up -d --wait db redis

echo "[deploy] Starting the stack with ${REPLICAS} server replica(s) (dbmigrate runs once first)..."
docker compose up -d --remove-orphans --wait --scale "server=${REPLICAS}"

echo "[deploy] Done. Current containers:"
docker compose ps
