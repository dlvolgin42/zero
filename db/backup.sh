#!/bin/sh
# A compressed dump of the whole database once a day, kept for 14 days. (There is no cron on the server, so this loops.)
set -eu
mkdir -p /backups
while true; do
  f="/backups/zero-$(date +%Y%m%d-%H%M%S).sql"
  if pg_dump --no-owner --clean --if-exists -f "$f" && gzip -f "$f"; then
    echo "backup written: $f.gz"
  else
    echo "backup FAILED" >&2
    rm -f "$f" "$f.gz"
  fi
  find /backups -name 'zero-*.sql.gz' -mtime +14 -delete
  sleep 86400
done
