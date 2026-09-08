#!/usr/bin/env bash
set -euo pipefail
umask 077
main() {
[[ $EUID -eq 0 ]] || { echo 'Als root auf dem Produktions-LXC ausführen.' >&2; exit 1; }
cd /srv/schwesterlib
exec 9>/run/lock/schwesterlib-deploy.lock
flock -n 9 || { echo 'Ein Deployment läuft bereits.' >&2; exit 1; }
as_app() {
  runuser -u schwesterlib -- env -i HOME=/var/lib/schwesterlib \
    USER=schwesterlib LOGNAME=schwesterlib PATH=/usr/bin:/bin "$@"
}
[[ -f .env && ! -L .env ]]
[[ $(stat -c %a .env) == 600 ]]
[[ $(stat -c %U .env) == schwesterlib ]]
[[ ! -e .env.local && ! -e .env.production && ! -e .env.production.local ]]
as_app /usr/bin/node scripts/check-production.mjs
[[ $(as_app git branch --show-current) == main ]]
[[ -z $(as_app git status --porcelain --untracked-files=all) ]] || {
  echo 'Lokale Änderungen vorhanden. Deployment abgebrochen.' >&2; exit 1;
}
[[ -z $(as_app git ls-files .env next-env.d.ts) ]] || {
  echo '.env oder generierte next-env.d.ts wird noch von Git verfolgt.' >&2; exit 1;
}
systemctl cat schwesterlib.service > /dev/null
systemctl is-active --quiet docker
docker compose -p schwesterlib exec -T db sh -c \
  'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > /dev/null
as_app git fetch origin main
as_app git merge-base --is-ancestor HEAD origin/main || {
  echo 'Lokaler Branch ist nicht per Fast-Forward aktualisierbar.' >&2; exit 1;
}
previous=$(as_app git rev-parse HEAD)
target=$(as_app git rev-parse origin/main)
printf 'Deployment: %s -> %s\n' "$previous" "$target"
install -d -m 700 /var/log/schwesterlib-deploy
deploy_log=$(mktemp /var/log/schwesterlib-deploy/deploy-XXXXXX.log)
stopped=false
failed() {
  if [[ $stopped == true ]]; then systemctl stop schwesterlib.service || true; fi
  printf 'Deployment fehlgeschlagen. Privates Protokoll: %s\nVorheriger Commit: %s\n' "$deploy_log" "$previous" >&2
  if [[ $stopped == true ]]; then echo 'Dienst bleibt gestoppt. Recovery-Anleitung beachten.' >&2; fi
}
trap failed ERR
# Stop before changing node_modules/.next; never build over a running server.
systemctl stop schwesterlib.service
stopped=true
bash scripts/backup-production.sh >> "$deploy_log" 2>&1
as_app git merge --ff-only "$target" >> "$deploy_log" 2>&1
as_app env NODE_ENV=development npm ci --include=dev >> "$deploy_log" 2>&1
as_app npm run db:generate >> "$deploy_log" 2>&1
as_app npm run db:migrate >> "$deploy_log" 2>&1
as_app env NODE_OPTIONS=--max-old-space-size=2048 npm run build >> "$deploy_log" 2>&1
systemctl start schwesterlib.service
healthy=false
for attempt in {1..30}; do
  if systemctl is-active --quiet schwesterlib.service && \
    curl --fail --silent --max-time 3 http://127.0.0.1:3000/api/health > /dev/null; then
    healthy=true
    break
  fi
  sleep 2
done
[[ $healthy == true ]]
stopped=false
printf 'Deployment erfolgreich. Commit: %s; Protokoll: %s\n' "$target" "$deploy_log"
}
main "$@"
