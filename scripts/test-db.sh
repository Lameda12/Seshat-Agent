#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
name="seshat-policy-test-$$"
docker --host=unix:///var/run/docker.sock run -d --name "$name" -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17.6 >/dev/null
trap 'docker --host=unix:///var/run/docker.sock rm -f "$name" >/dev/null' EXIT
for attempt in $(seq 1 30); do
 if docker --host=unix:///var/run/docker.sock exec "$name" pg_isready -U postgres >/dev/null 2>&1; then break; fi
 sleep 1
done
docker --host=unix:///var/run/docker.sock cp supabase/migrations "$name":/migrations
docker --host=unix:///var/run/docker.sock exec -i "$name" psql -U postgres -v ON_ERROR_STOP=1 < tests/policies.sql
