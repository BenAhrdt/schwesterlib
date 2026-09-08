#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $EUID -eq 0 ]] || { echo 'Als root auf dem Produktions-LXC ausführen.' >&2; exit 1; }
cd /srv/schwesterlib
backup_dir=/var/backups/schwesterlib
install -d -m 700 "$backup_dir"
backup_file=$(mktemp "$backup_dir/database-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX.dump")
trap 'rm -f -- "$backup_file"' ERR
# Explicit project name preserves the existing Compose volume identity.
docker compose -p schwesterlib exec -T db sh -c \
  'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$backup_file"
[[ -s "$backup_file" ]]
docker compose -p schwesterlib exec -T db pg_restore --list < "$backup_file" > /dev/null
printf 'Backup: %s\n' "$backup_file"
