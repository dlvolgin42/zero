#!/bin/sh
# Applies db/migrations/*.sql in name order, once each. Runs in a postgres image; connection comes from PG* variables.
set -eu
psql -v ON_ERROR_STOP=1 -q -c "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())"
for f in /migrations/*.sql; do
  name=$(basename "$f")
  if [ "$(psql -At -c "select 1 from schema_migrations where name = '$name'")" = "1" ]; then
    echo "already applied: $name"
    continue
  fi
  echo "applying: $name"
  psql -v ON_ERROR_STOP=1 -q --single-transaction -f "$f" -c "insert into schema_migrations (name) values ('$name')"
done
echo "migrations done"
