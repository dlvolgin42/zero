#!/usr/bin/env bash
# Build locally, upload only what changed to the server and restart the service.
set -euo pipefail
cd "$(dirname "$0")/.."
HOST="${ZERO_HOST:-zero@your-server}"

npm run build

rm -rf .deploy
mkdir -p .deploy/build/public
cp -R .next/standalone .deploy/build/standalone
# sharp ships macOS-only binaries here; they do not run on the Linux server and the app has no image optimisation.
rm -rf .deploy/build/standalone/node_modules/@img .deploy/build/standalone/node_modules/sharp
cp -R .next/static .deploy/build/static
# Everything in public/ (icons included) except the local design scratch page.
cp -R public/. .deploy/build/public/
rm -f .deploy/build/public/logo-options.html
cp deploy/Dockerfile deploy/compose.yaml .deploy/
cp -R db .deploy/db

ssh "$HOST" 'mkdir -p ~/app'
# --checksum: send a file only if its content changed (build tools rewrite timestamps every time).
# --exclude=.env and backups/: the server's secrets and database dumps stay untouched and are never deleted.
rsync -az --delete --checksum --stats --exclude=.env --exclude=backups/ -e ssh .deploy/ "$HOST":app/

ssh "$HOST" '
  set -e
  cd ~/app
  touch .env && chmod 600 .env
  # The database password is created once, on the server, and never leaves it.
  grep -q "^POSTGRES_PASSWORD=" .env || printf "POSTGRES_PASSWORD=%s\n" "$(head -c 24 /dev/urandom | od -An -tx1 | tr -d " \n")" >> .env
  mkdir -p backups
  docker compose up -d --build
  docker image prune -f >/dev/null
  docker compose ps
'
rm -rf .deploy
