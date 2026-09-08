# SchwesterLib auf Debian 13

## Umgebungen und geprüfter Ausgangsstand

Entwicklung: `webDev`, `/home/ben/schwesterlib`, Git-Branch `main`. Tests einschließlich Playwright ausschließlich dort und auf einer separaten `_test`-Datenbank ausführen.

Produktion: LXC `schwesterlib`, Node direkt auf dem Host, PostgreSQL 17 in Docker, Zoraxy als HTTPS-Reverse-Proxy. Laut Betreiber erfolgreich installiert mit Node 22.23.2, npm 10.9.8, Docker 29.8.0 und Compose 5.5.1. Node systemweit unter `/usr/bin/node` installieren; keine NVM-Abhängigkeit im Dienst. `npm ci --include=dev` benötigt auch Build-Abhängigkeiten. Die Lockdatei bestimmt die Paketversionen.

Das bestehende Compose-Volume, die Migration mit Überlappungs-Constraint, die serverseitige Origin-Prüfung und die persistente Setup-Sperre passen zu diesem Betrieb. Fehlend waren Dienstverwaltung, ein kontrollierter Updateablauf und Backups. Ein Build verändert `.next` und `next-env.d.ts`: deshalb wird der Dienst vor Änderungen gestoppt und die generierte Typdatei künftig nicht versioniert.

## Einmaliger Umzug der bestehenden Installation

Diese Schritte als root auf dem **Produktions-LXC** ausführen, nachdem der neue Code auf GitHub verfügbar ist. Wartungszeit einplanen. Kein erneutes Setup, kein Seed und kein Kopieren von Entwicklungsdaten.

1. In `/root/schwesterlib` den alten Commit notieren (`git rev-parse HEAD`) und `git status --short` prüfen. Eigene Änderungen sichern/klären. Nur die automatisch generierte `next-env.d.ts` darf bei Bedarf mit `git restore -- next-env.d.ts` zurückgesetzt werden. Danach `git pull --ff-only origin main`.
2. Vor dem Umzug die laufende Datenbank identifizieren:

   ```bash
   cd /root/schwesterlib
   docker compose ls
   docker compose -p schwesterlib ps db
   docker volume inspect schwesterlib_postgres_data --format '{{.Name}}'
   ```

   Die Anleitung setzt den bisherigen Projektnamen `schwesterlib` voraus. Container-Mount mit `docker inspect --format '{{range .Mounts}}{{println .Name .Destination}}{{end}}' CONTAINER_ID` kontrollieren: `schwesterlib_postgres_data` muss `/var/lib/postgresql/data` zugeordnet sein. Bei anderem Projektnamen zuerst Anleitung und Scripts an den **bestehenden** Namen anpassen. Niemals zur Fehlerbehebung ein leeres Volume anlegen. Compose-Namen bestimmen die Volume-Zuordnung ([Docker-Dokumentation](https://docs.docker.com/compose/how-tos/project-name/)).
3. Den bisher manuell gestarteten Next-Prozess im zugehörigen Terminal beenden. Datenbank laufen lassen. Noch vor dem Umzug ein Backup erstellen:

   ```bash
   install -d -m 700 /var/backups/schwesterlib
   umask 077
   docker compose -p schwesterlib exec -T db sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > /var/backups/schwesterlib/before-service-migration.dump
   docker compose -p schwesterlib exec -T db pg_restore --list < /var/backups/schwesterlib/before-service-migration.dump > /dev/null
   ```

   Bei Fehler abbrechen. Einen bereits vorhandenen Backupnamen nicht wiederverwenden.
4. Benutzer anlegen und das **vorhandene** Verzeichnis verschieben. Falls Benutzer oder Ziel bereits existieren, erst deren Zustand prüfen:

   ```bash
   useradd --system --user-group --create-home --home-dir /var/lib/schwesterlib --shell /usr/sbin/nologin schwesterlib
   test ! -e /srv/schwesterlib
   mv /root/schwesterlib /srv/schwesterlib
   chown -R schwesterlib:schwesterlib /srv/schwesterlib
   chmod 750 /srv/schwesterlib
   chmod 600 /srv/schwesterlib/.env
   cd /srv/schwesterlib
   ```

   Root bleibt für systemd und Docker zuständig. Der App-Benutzer erhält **keine** Docker-Gruppenmitgliedschaft und kein sudo. Er besitzt Repository, Dependencies und Build-Dateien für Git/npm-Updates; systemd beschränkt Schreibzugriffe des laufenden Dienstes auf `.next`. `/root` wird nicht zugänglich gemacht. Für ein privates GitHub-Repository einen nur lesenden Deploy-Key für den App-Benutzer einrichten; keine Tokens in Git-URLs speichern.
5. Vorhandene `.env` beibehalten. `DATABASE_URL` muss auf `localhost:5432` oder `127.0.0.1:5432`, Datenbank/Benutzer `schwesterlib`, zeigen. URL-kodiertes Passwort muss `POSTGRES_PASSWORD` entsprechen. `APP_URL` ist die öffentliche HTTPS-Origin ohne Pfad oder abschließenden Slash. Session-/Verschlüsselungs-/Setup-Secrets bleiben identisch. Keine zusätzlichen `.env.local` oder `.env.production*` anlegen. Next.js und Hilfsscripts laden `.env` selbst; systemd enthält keine Secrets und verwendet keinen anders interpretierenden `EnvironmentFile`-Parser.
6. Abhängigkeiten, Konfiguration und Build prüfen, dann den Dienst installieren:

   ```bash
   runuser -u schwesterlib -- npm ci --include=dev
   runuser -u schwesterlib -- node scripts/check-production.mjs
   runuser -u schwesterlib -- npm run db:generate
   runuser -u schwesterlib -- npm run db:migrate
   runuser -u schwesterlib -- env NODE_OPTIONS=--max-old-space-size=2048 npm run build
   install -m 644 deploy/systemd/schwesterlib.service /etc/systemd/system/schwesterlib.service
   systemctl daemon-reload
   systemctl enable --now docker
   systemctl enable --now schwesterlib
   curl --fail http://127.0.0.1:3000/api/health
   ```

   Jeden Schritt nur nach Erfolg des vorigen ausführen. Der Dienst wartet beim Start auf eine erreichbare Datenbank und das Anwendungsschema. Docker startet den vorhandenen Container über `restart: unless-stopped`; ein bewusst gestoppter DB-Container muss vom Betreiber wieder gestartet werden. Nach einem echten LXC-Neustart die Erreichbarkeit prüfen.

## Neue Installation

Nur bei einer tatsächlich leeren Installation: Debian 13, systemweites Node 22.23.2 oder kompatibles neueres Node, Git, curl und Docker mit Compose installieren. Benutzer wie oben anlegen, Repository als dieser Benutzer nach `/srv/schwesterlib` klonen. Einmal `.env.example` nach `.env` kopieren, eigene Secrets erzeugen und Rechte setzen. PostgreSQL einmal mit `docker compose -p schwesterlib up -d db` starten. Danach Installations-/Migrations-/Build-/Dienstschritte oben ausführen. Optional einmal `npm run db:seed` für Leistungen; kein Admin wird erzeugt. Den ersten Admin ausschließlich über die öffentliche HTTPS-URL `/setup` mit `SETUP_KEY` erstellen.

Bei der **bestehenden Installation gibt es bereits einen Admin**. `AppSettings.setupCompleted` und die Admin-Prüfung sperren Setup serverseitig; Migrationen verändern diesen Zustand nicht. Keine vorhandene Migration bearbeiten, sondern neue Migrationen committen. Keine `migrate reset`, `db push`, Datenbank-Truncates oder `docker compose down -v` für Updates verwenden.

## Zoraxy und Origin

Zoraxy terminiert HTTPS und leitet auf `http://INTERNE_LXC_IP:3000` weiter. Öffentlichen Host und Browser-`Origin` unverändert weitergeben, `X-Forwarded-Proto: https` setzen. `TRUST_PROXY=true` ausschließlich, wenn Zoraxy eingehendes `X-Forwarded-For` zuverlässig überschreibt und Port 3000 per Firewall nur aus dem Proxy-/Administrationsnetz erreichbar ist. Andernfalls `false` belassen (gemeinsames IP-Rate-Limit). Die App vertraut diesem Header nur für Rate-Limits; CSRF prüft weiterhin die exakte Origin gegen `APP_URL`.

PostgreSQL bleibt an `127.0.0.1:5432` gebunden. Port 3000 nicht im Internet freigeben. Login und Setup im Browser über HTTPS prüfen, inklusive Cookie `Secure`, `HttpOnly`, `SameSite=Lax`. Die lokale HTTP-Gesundheitsprüfung braucht keine Anmeldung und liefert nur `ok`/`unavailable`; sie prüft auch den Datenbankzugriff, aber nicht SMTP oder den externen Proxy.

## Updates

Auf webDev: Änderungen prüfen, Typecheck/Linter/Tests/Build ausführen, konkrete Dateien committen und `main` zu GitHub pushen. Keine Produktions-Secrets oder Testdaten übertragen.

Auf dem Produktions-LXC:

```bash
cd /srv/schwesterlib
bash scripts/deploy-production.sh
```

Das Script prüft Konfiguration, sauberen Branch, Datenbank und Dienst; sperrt parallele Deployments; holt `origin/main` und erlaubt nur Fast-Forward. Danach stoppt es die App, sichert PostgreSQL, aktualisiert Code/Dependencies, erzeugt Prisma, führt `migrate deploy` und Build aus und startet den Dienst mit Gesundheitsprüfung. Kein Seed, kein Compose-`up/down`, keine Änderung an `.env`. Die Wartungsphase dauert über Installation, Migrationen und Build hinweg. Auch ein erneuter Lauf desselben Commits baut neu und erstellt ein Backup.

Bei Fehlern bleibt die App ab Beginn der Wartungsphase gestoppt. Es gibt keinen automatischen Code-/Datenbank-Rollback. Der alte Commit wird ausgegeben. Build-/Migrationsausgaben liegen ausschließlich in root-lesbaren Dateien unter `/var/log/schwesterlib-deploy`; vor Weitergabe auf sensible Inhalte prüfen. Scripts geben keine Environment-Werte aus und verwenden kein Shell-Tracing. Änderungen an der systemd-Datei werden bewusst separat geprüft und mit `install`, `daemon-reload`, `restart` wie oben übernommen; das Script installiert keine neuen Root-Dienstdefinitionen automatisch.

## Backups und Recovery

```bash
cd /srv/schwesterlib
bash scripts/backup-production.sh
```

Erstellt ein Custom-Format-Archiv mit zufälligem Dateisuffix außerhalb des Docker-Volumes unter `/var/backups/schwesterlib`, Rechte 600. Unvollständige Backups werden entfernt; das Inhaltsverzeichnis wird mit `pg_restore --list` geprüft. Das ersetzt keinen Wiederherstellungstest. Custom-Format unterstützt gezielte Wiederherstellung ([PostgreSQL 17](https://www.postgresql.org/docs/17/app-pgdump.html)). Vor jeder Deployment-Migration automatisch, zusätzlich regelmäßig manuell sichern. Mindestens die letzten sieben erfolgreichen Backups behalten, ältere erst nach Prüfung entfernen; keine automatische Löschung. Eine verschlüsselte Kopie regelmäßig außerhalb des LXC aufbewahren. `.env` separat verschlüsselt sichern, insbesondere `ENCRYPTION_KEY`; Datenbankbackup allein stellt SMTP-Secrets nicht wieder her.

Restore zunächst in einer **separaten leeren Datenbank** desselben PostgreSQL-Servers testen, z. B. `schwesterlib_restore_check`, mit `createdb` im Container anlegen und `pg_restore --exit-on-error --no-owner --no-privileges -U schwesterlib -d schwesterlib_restore_check` über `docker compose -p schwesterlib exec -T db` aus dem gewählten Archiv speisen. Vor produktiver Wiederherstellung Benutzer, Setup-Sperre und Termine in der Testkopie kontrollieren. Nie das Restore-Ziel ungeprüft auf die produktive Datenbank setzen.

Nach fehlgeschlagenem Deployment: privates Protokoll prüfen, Datenbank unangetastet lassen. Bei Build-/Dependency-Fehler Ursache beheben und Script erneut ausführen. Fehlgeschlagene Migrationen zuerst anhand des Prisma-Status und der tatsächlich ausgeführten SQL-Schritte untersuchen; `migrate resolve` nur nach geklärtem Zustand. Ein früherer Code-Commit darf nur mit kompatiblem Datenbankschema gestartet werden. Datenbank-Restore überschreibt neuere Daten und ist ein gesonderter, geplanter Wiederherstellungsschritt. Kein automatischer Reset.

## Betrieb

```bash
systemctl status schwesterlib
journalctl -u schwesterlib -n 100 --no-pager
journalctl -u schwesterlib -f
systemctl restart schwesterlib
docker compose -p schwesterlib ps db
curl --fail http://127.0.0.1:3000/api/health
```

Nach Updates zusätzlich über Zoraxy anmelden und bestehende Termine prüfen. Der App-Dienst läuft ohne root, startet beim Boot und wird nach unerwartetem Abbruch neu gestartet. Die tatsächliche systemd-/Docker-/Zoraxy-Installation und der Neustarttest müssen auf dem Produktions-LXC erfolgen; webDev ersetzt diesen Betriebstest nicht.

## Diesen Stand veröffentlichen

Auf webDev gehören die folgenden Dateien zum Commit, einschließlich der vorherigen mobilen Layout-/Browsertestkorrekturen. `next-env.d.ts` bleibt lokal erhalten, wird aber aus dem Index entfernt:

```bash
cd /home/ben/schwesterlib
git rm --cached --ignore-unmatch next-env.d.ts
git add .env.example .gitignore README.md docs/PRODUCTION.md docs/RECOVERY.md deploy/systemd/schwesterlib.service scripts/backup-production.sh scripts/check-production.mjs scripts/deploy-production.sh scripts/wait-for-database.mjs src/app/api/health/route.ts src/app/globals.css tests/deployment.test.ts tests/production.test.ts tests/browser/booking.spec.ts
git add prisma/schema.prisma prisma/migrations/202609080002_provider_drafts_notifications/migration.sql src/lib/accounts.ts src/lib/mail.ts src/lib/scheduling.ts src/lib/validation.ts src/components/workspace.tsx 'src/app/api/[...path]/route.ts' tests/integration.test.ts tests/mail.test.ts tests/provider-migration.test.ts
git diff --cached --stat
git commit -m "Add provider drafts, appointment notifications and production deployment"
git push origin main
```

Validiert auf webDev: Typecheck, ESLint, 27 Unit-/Integrationsprüfungen gegen isoliertes PostgreSQL, Shell-Syntax, `systemd-analyze verify`, Produktionsbuild und echter HTTP-Healthcheck mit Datenbankzugriff. Deployment-Fehlerpfade wurden mit simulierten Git/npm/systemd/Docker-Kommandos geprüft (lokale Änderungen, Backupfehler, Buildfehler, fehlgeschlagener Healthcheck und Erfolg). Keine echte Docker-Sicherung oder systemd-Installation auf dem Produktions-LXC ausgeführt. Der vollständige vorhandene Browsertest bestand unmittelbar vor diesen Betriebsänderungen.
