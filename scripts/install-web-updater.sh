#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $EUID -eq 0 ]] || { echo 'Als root auf dem Produktions-LXC ausführen.' >&2; exit 1; }
[[ $(systemctl show schwesterlib.service -p LoadState --value) == loaded ]]
app_dir=$(systemctl show schwesterlib.service -p WorkingDirectory --value)
app_user=$(systemctl show schwesterlib.service -p User --value)
app_group=$(systemctl show schwesterlib.service -p Group --value)
app_user=${app_user:-root}
app_group=${app_group:-$app_user}
app_home=$(getent passwd "$app_user" | cut -d: -f6)
[[ $app_dir == /* && -d $app_dir/.git && -n $app_home ]]
[[ $app_user =~ ^[a-zA-Z_][a-zA-Z0-9_-]*$ && $app_group =~ ^[a-zA-Z_][a-zA-Z0-9_-]*$ ]]
install -D -o root -g root -m 0755 deploy/systemd/schwesterlib-update /usr/local/libexec/schwesterlib-update
install -D -o root -g root -m 0644 deploy/systemd/schwesterlib-update.service /etc/systemd/system/schwesterlib-update.service
install -D -o root -g root -m 0644 deploy/systemd/schwesterlib-update.path /etc/systemd/system/schwesterlib-update.path
sed "s/APP_USER/$app_user/g; s/APP_GROUP/$app_group/g" deploy/systemd/schwesterlib-tmpfiles.conf \
  > /etc/tmpfiles.d/schwesterlib.conf
chmod 0644 /etc/tmpfiles.d/schwesterlib.conf
{
  printf 'APP_DIR=%q\n' "$app_dir"
  printf 'APP_USER=%q\n' "$app_user"
  printf 'APP_GROUP=%q\n' "$app_group"
  printf 'APP_HOME=%q\n' "$app_home"
  printf 'COMPOSE_PROJECT_NAME=schwesterlib\n'
} > /etc/schwesterlib-update.conf
chmod 0600 /etc/schwesterlib-update.conf
install -d -m 0755 /etc/systemd/system/schwesterlib.service.d
printf '[Service]\nEnvironment=UPDATE_REQUEST_PATH=/run/schwesterlib/requests/update-request\nEnvironment=UPDATE_STATUS_PATH=/run/schwesterlib/update-status.json\nReadWritePaths=/run/schwesterlib/requests\n' \
  > /etc/systemd/system/schwesterlib.service.d/20-web-updater.conf
chmod 0644 /etc/systemd/system/schwesterlib.service.d/20-web-updater.conf
systemd-tmpfiles --create /etc/tmpfiles.d/schwesterlib.conf
systemctl daemon-reload
systemctl enable --now schwesterlib-update.path
systemctl restart schwesterlib.service
echo 'Web-Updater eingerichtet.'
