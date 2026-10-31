#!/bin/sh
# Holt den neuesten Stand aus GitHub und baut die App neu
set -e
cd "$(dirname "$0")"
git -C quelle pull --ff-only
docker compose up -d --build
docker image prune -f >/dev/null
