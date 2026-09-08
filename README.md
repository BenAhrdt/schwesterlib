# SchwesterLib

Aktuelle Version: **1.3.0** · Änderungen siehe [CHANGELOG.md](CHANGELOG.md).

**Meine Schwester. Mein Termin. Mein Verband.** Eine private, einladungsbasierte Terminplattform mit eigener blau-türkiser Oberfläche, responsiven Dashboards und echter PostgreSQL-Buchungslogik. Keine öffentliche Registrierung und keine medizinischen Behandlungsnotizen.

## Voraussetzungen

- Node.js 22.12 oder neuer, npm
- PostgreSQL 17 mit `btree_gist`, alternativ Docker mit Compose
- Für den Produktivbetrieb: HTTPS-Reverse-Proxy und persistente Datenbank

## Installation und Entwicklung

```bash
npm ci
cp .env.example .env
```

Die `.env` ausfüllen. Für das Datenbankpasswort eignet sich `openssl rand -hex 24`; denselben Wert in `POSTGRES_PASSWORD` und im Passwortteil der `DATABASE_URL` einsetzen. Unabhängige Secrets erzeugen:

```bash
openssl rand -base64 48  # SESSION_SECRET
openssl rand -hex 32    # ENCRYPTION_KEY
openssl rand -hex 24    # SETUP_KEY
```

Jeden Befehl separat ausführen und den jeweiligen Wert in `.env` eintragen. Keine Beispielwerte als produktive Secrets verwenden. Bestehende `.env` und vorhandene Datenbanken bei einer Fortsetzung beibehalten.

```bash
docker compose up -d db
npm run db:generate
npm run db:migrate
npm run db:seed          # optional: vier Leistungen, keine Benutzer
npm run dev
```

Unter **http://localhost:3000** öffnen. Bei Zugriff über die LXC-IP `APP_URL` entsprechend setzen, z. B. `http://192.168.1.50:3000`, und den Server neu starten. Die aufgerufene Browser-Origin muss mit `APP_URL` übereinstimmen. Der Entwicklungsserver lauscht auf allen Interfaces.

Ohne Docker eine eigene PostgreSQL-Datenbank und einen Benutzer anlegen und `DATABASE_URL` darauf richten. Migrationen benötigen die Berechtigung für die Extension `btree_gist`; ein Datenbankadministrator kann diese vorab einrichten. `prisma db push` ersetzt die Migrationen nicht: Der wichtige Exclusion Constraint ist SQL in der Migration.

## Environment Variables

| Variable            | Bedeutung                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `DATABASE_URL`      | PostgreSQL-Verbindung mit Benutzer, Passwort, Host, Port und Datenbank                   |
| `POSTGRES_PASSWORD` | Passwort des PostgreSQL-Benutzers im Docker-Compose-Container                            |
| `APP_URL`           | Exakte öffentliche URL ohne abschließenden Slash; für CSRF-Prüfung und Einladungslinks   |
| `SESSION_SECRET`    | Unabhängiges zufälliges Secret, mindestens 32 Zeichen                                    |
| `ENCRYPTION_KEY`    | Genau 64 Hex-Zeichen; AES-256-GCM-Schlüssel für SMTP-Passwörter                          |
| `SETUP_KEY`         | Zusätzlicher Installationsschlüssel; in Production erforderlich, in Development optional |
| `TRUST_PROXY`       | Nur `true`, wenn der vorgeschaltete Proxy `X-Forwarded-For` zuverlässig überschreibt     |
| `TEST_DATABASE_URL` | Ausschließlich für Tests: separate Datenbank, deren Name auf `_test` endet               |

Secrets sind ausschließlich serverseitig und werden nicht committed. Den Verschlüsselungsschlüssel zusammen mit einem Datenbankbackup getrennt und sicher aufbewahren. Ein Wechsel des Session-Secrets meldet alle Sitzungen ab. Bei Wechsel des Verschlüsselungsschlüssels muss SMTP neu eingerichtet werden.

## Ersten Administrator erstellen

1. `/setup` öffnen.
2. Benutzername, Anzeigename und ein eigenes Passwort (mindestens zwölf Zeichen) samt Bestätigung angeben. E-Mail ist optional.
3. Falls gesetzt bzw. im Produktivbetrieb: den `SETUP_KEY` aus der Serverkonfiguration eingeben.
4. Nach dem Speichern bist du angemeldet. Der Setup-Endpunkt ist dauerhaft gesperrt, auch wenn später Administratorrollen geändert werden.

Es gibt keine vordefinierten Konten oder Passwörter. Zwei parallele Setup-Aufrufe werden durch eine PostgreSQL-Transaktion und einen Advisory Lock serialisiert. Die persistente Sperre `AppSettings.setupCompleted` verhindert ein erneutes Setup.

## Schwester einladen und erste Buchung

1. **Administration → Benutzer → Benutzer einladen** öffnen.
2. Rolle **Behandler** wählen, optional Anzeigename und E-Mail eintragen sowie Ablaufdatum auswählen.
3. **Einladung erstellen** und den einmalig angezeigten **Einladungslink kopieren**. Ohne SMTP persönlich übermitteln.
4. Deine Schwester öffnet den Link und wählt ihre eigenen Zugangsdaten. Eine vorgegebene E-Mail ist serverseitig an die Einladung gebunden.
5. Unter **Terminarten** eine Leistung anlegen bzw. eine Seed-Leistung bearbeiten und deine Schwester als Behandler zuordnen.
6. Sie trägt unter **Verfügbarkeit** ihre Wochenzeiten ein. Urlaub, gesperrte Zeiten und zusätzliche Verfügbarkeit können separat erfasst werden.
7. Unter **Termin buchen** Behandler, Leistung, Datum und Uhrzeit auswählen und verbindlich buchen. Auch der Administrator kann eigene Termine buchen; weitere Benutzer werden mit Rolle **Benutzer** eingeladen.

Unter **Meine Termine** stehen Details, Verschieben und Absagen bereit. Behandler verwalten ihre Termine im Kalender; Administratoren sehen alle Termine. Die Tages-, Wochen- und Monatsansicht ist anklickbar. Aktive Buchungen sind standardmäßig bestätigt. Der Status `PENDING` und dessen Bestätigung sind ebenfalls unterstützt; abgeschlossene/abgesagte Termine können nicht reaktiviert werden.

## Behandlerentwürfe und Benachrichtigungen

### Behandler vor der Einladungsannahme vorbereiten

Eine Einladung mit Rolle **Behandler** legt sofort einen Entwurf unter **Administration → Behandler** an. Dort lassen sich Anzeigename, Profil, Leistungen und Verfügbarkeiten vorbereiten. „Einladung ausstehend“, „abgelaufen“ oder „widerrufen“ kennzeichnet den Zustand. Entwürfe erscheinen nicht im Buchungskatalog und sind auch über direkte Buchungsanfragen nicht buchbar. Bei Annahme wird das vorhandene Profil mit dem neuen Konto verbunden; vorbereitete Leistungen und Zeiten bleiben erhalten. Die an eine Einladung gebundene E-Mail-Adresse wird dadurch nicht geändert. Abgelaufene oder widerrufene Entwürfe bleiben zur Einsicht erhalten; eine neue Einladung erzeugt einen neuen Entwurf.

Die Migration `202609080002_provider_drafts_notifications` ergänzt Entwürfe auch für bereits vorhandene offene Behandlereinladungen. Vor dem produktiven Update ein Backup erstellen und `npm run db:migrate` ausführen. Bestehende Konten, Termine und die Setup-Sperre bleiben erhalten.

### Termin-E-Mails für Behandler

Im **Behandlerprofil** aktiviert der Behandler selbst oder ein Administrator „E-Mail bei Buchung, Verschiebung und Absage“. Der Schalter ist standardmäßig aus. Versand benötigt SMTP, ein angenommenes aktives Konto und dessen E-Mail-Adresse; diese wird unter **Mein Profil** bzw. in der Benutzerverwaltung gepflegt. Auch wenn der buchende Benutzer keine E-Mail hat, erhält der Behandler seine Nachricht. Beide Empfänger werden getrennt angeschrieben; ein Fehler bei einem Empfänger verhindert den Versuch an den anderen nicht. Die Nachricht enthält nur den Anlass und einen Link zum Dashboard, keine Leistungs- oder Patientendetails. Buchung und Absage bleiben bei Versandfehlern gespeichert. Keine automatische Wiederholung; Pushnachrichten sind noch nicht implementiert.

## SMTP

Unter **Einstellungen → E-Mail / SMTP** Host, Port, TLS-Modus, Benutzername, Passwort und Absender konfigurieren. Port 465 nutzt implizites TLS; andere Ports verwenden verpflichtendes STARTTLS. Selbstsignierte Zertifikate werden abgewiesen. Ohne SMTP funktioniert die gesamte Termin- und Einladungsverwaltung.

Zuerst speichern, anschließend **Verbindung testen** oder eine **Testmail** an eine selbst gewählte Adresse senden. Ein leeres Passwortfeld beim Bearbeiten behält das vorhandene Passwort. Das gespeicherte Passwort wird nie zurück an den Browser geschickt und mit AES-256-GCM verschlüsselt gespeichert.

Neue Einladungen mit E-Mail werden bei eingerichteter SMTP-Konfiguration automatisch versendet. Buchung, Verschiebung und Statusänderung erzeugen organisatorische Benachrichtigungen ohne Leistungsdetails. Ein Versandfehler macht eine bereits gespeicherte Buchung nicht rückgängig. `src/lib/mail.ts` bildet die erweiterbare Versandschnittstelle.

## Vergessenes Passwort zurücksetzen

Unter **Administration → Benutzer** kann ein Administrator beim betroffenen aktiven Konto **Passwort zurücksetzen** wählen. Der dort erzeugte Link ist eine Stunde gültig, nur einmal verwendbar und muss über einen geeigneten privaten Kanal an den Benutzer weitergegeben werden. Ein neu erzeugter Link macht vorherige Links für dasselbe Konto ungültig. Der Benutzer legt über den Link selbst ein neues Passwort fest; danach werden sämtliche bisherigen Sitzungen dieses Kontos beendet.

Weder alte noch neue Passwörter sind für Administratoren sichtbar. Reset-Token werden nur gehasht gespeichert. Ein automatischer Versand des Reset-Links erfolgt bewusst nicht, solange keine E-Mail-Verifizierung vorhanden ist.

## Production

Die konkrete Anleitung für den separaten Debian-13-LXC, Zoraxy, den Umzug von `/root/schwesterlib` nach `/srv/schwesterlib`, systemd, Updates und Backups steht in [docs/PRODUCTION.md](docs/PRODUCTION.md). Bestehende Produktionsdatenbank, Admin und `.env` bleiben erhalten. Entwicklungs- und Browsertests laufen ausschließlich auf `webDev` mit einer separaten Testdatenbank.

Administratoren können nach einmaliger Einrichtung des getrennten systemd-Updaters unter **Einstellungen** neue veröffentlichte Versionen prüfen und installieren. Die Webanwendung selbst erhält dabei keine Root-, Docker- oder systemd-Rechte. Einrichtung und Recovery stehen im Abschnitt „Updates aus der Weboberfläche“ der Produktionsanleitung.

```bash
npm ci
npm run db:generate
npm run db:migrate
npm run build
npm start
```

Vorher `APP_URL=https://deine-domain.example`, Secrets und `SETUP_KEY` konfigurieren. Next.js als beaufsichtigten Dienst (z. B. systemd) hinter einem HTTPS-Reverse-Proxy betreiben. In Production sind Cookies `Secure`, `HttpOnly`, `SameSite=Lax` und mit `__Host-`-Präfix gesetzt. Ein Produktionsserver über unverschlüsseltes HTTP auf einer Netzwerk-IP ist daher kein unterstützter Loginbetrieb. Für lokales HTTP `npm run dev` verwenden.

`docker-compose.yml` containerisiert PostgreSQL mit Healthcheck und persistentem Volume; die Anwendung läuft mit Node.js auf dem Host. Der Datenbankport ist nur an Loopback gebunden. Backups regelmäßig erstellen und Wiederherstellung testen. `docker compose down -v` löscht die Daten und ist kein normaler Neustartbefehl.

Webpack wird für Development und Build explizit genutzt: Turbopacks CSS-Unterprozess konnte in der geprüften LXC/Sandbox-Umgebung keinen Socket öffnen. Next.js und die übrigen Libraries bleiben auf den installierten stabilen Versionen. ESLint 10 verwendet die offizielle `@eslint/compat`-Schicht für das noch ältere React-Regel-API ([ESLint-Dokumentation](https://eslint.org/blog/2024/05/eslint-compatibility-utilities/)).

Für den LXC begrenzt `next.config.ts` die Build-Worker auf einen und aktiviert `webpackMemoryOptimizations`. Prüfungen nacheinander ausführen. Bei knappem Arbeitsspeicher kann `NODE_OPTIONS=--max-old-space-size=2048 npm run build` den JavaScript-Heap pro Prozess begrenzen; das ist keine Obergrenze für den gesamten Containerverbrauch.

## Tests

```bash
npm run db:generate
npm run typecheck
npm run lint
npm test
npm run build
```

Ohne `DATABASE_URL` führt `npm test` die Unit-Tests aus und überspringt die Datenbanktests. Für die vollständige Prüfung eine **separate leere Testdatenbank** erstellen, etwa `schwesterlib_test`, und explizit konfigurieren:

```bash
export TEST_DATABASE_URL='postgresql://USER:PASSWORD@localhost:5432/schwesterlib_test'
npm run test:integration
npx playwright install chromium
npm run test:e2e
```

`test:integration` wendet zuerst die Migrationen an und führt dann sämtliche Vitest-Tests mit der Testdatenbank aus. Die Browsertests erwarten diese Migrationen und starten einen separaten Entwicklungsserver auf Port 3100. Beide Suiten leeren ihre Testtabellen; niemals parallel oder gegen Anwendungsdaten ausführen. Der Namenssuffix `_test` ist eine zusätzliche Schutzprüfung.

Geprüft werden Setup inklusive Parallelität, Anmeldung und Fehlergleichheit, Einladungserstellung/-ablauf/-widerruf/-einmaligkeit, Rollen und Eigentumsrechte, Puffer und Ausnahmen, Doppelbuchungen einschließlich direkter Constraint-Prüfung, Absagen, atomare Verschiebung und Rate Limits. Playwright prüft den vollständigen Ablauf mit Desktop-Admin und mobilem Benutzer einschließlich direkter verbotener API-Aufrufe.

## Architektur und Sicherheit

- **Next.js App Router / React / TypeScript**, Tailwind und lokale shadcn-kompatible Komponenten (Radix, CVA).
- **Prisma/PostgreSQL** mit UTC-Zeitpunkten (`timestamptz`); Wochenzeiten in der konfigurierten IANA-Zeitzone, Standard `Europe/Berlin`. Slots im Fünf-Minuten-Raster, mit UTC-Offset zur Unterscheidung doppelter Stunden im Herbst.
- **Argon2id** (64 MiB, drei Durchläufe), **iron-session** für verschlüsselte Cookies sowie gehashte, widerrufbare Datenbank-Sessions. Als etablierte Session-Bibliothek gewählt; sämtliche Zugangsdatenprüfung bleibt serverseitig.
- **Serverseitige RBAC** und Eigentumsprüfung in geschützten API-/Domänenfunktionen. Aktuelle Rollen und Aktivstatus werden aus der Datenbank geladen. Rollenwechsel widerrufen Sitzungen; der letzte aktive Administrator bleibt erhalten.
- **256-Bit-Einladungs- und Reset-Token**, nur SHA-256-Hash persistiert, Ablauf, Widerruf und atomarer Einmalverbrauch. Token und Passwörter stehen nicht im Audit Log.
- **Buchungssicherheit**: Provider-Advisory-Lock plus Transaktion für Verfügbarkeit, Buchung, Absage und Verschiebung. Zusätzlich verhindert ein PostgreSQL-GiST-Exclusion-Constraint überlappende aktive Belegungsintervalle inklusive beider Puffer. Ein gescheitertes Verschieben lässt den ursprünglichen Termin bestehen.
- **Zod**, parametrisierte Queries, React-Output-Encoding, Origin-Prüfung für JSON-Mutationen, Nonce-CSP und Security Headers. Datenbankbasierte atomare Rate Limits für sensible Endpunkte und Benutzermutationen.
- **Datensparsamkeit**: keine Diagnose-/Behandlungsfelder. Sicherheits- und Verwaltungsaktionen werden mit Aktion, Akteur, Ziel-ID und Zeitpunkt protokolliert.

## Zentrale Dateien

| Pfad                                            | Inhalt                                                      |
| ----------------------------------------------- | ----------------------------------------------------------- |
| `prisma/schema.prisma`, `prisma/migrations/`    | Datenmodell und SQL-Constraints                             |
| `src/lib/accounts.ts`, `auth.ts`, `security.ts` | Setup, Einladung, Rollen, Sessions, Tokens, Verschlüsselung |
| `src/lib/scheduling.ts`                         | Slots, Buchungen, Status, Verfügbarkeiten                   |
| `src/lib/validation.ts`, `mail.ts`              | Eingabeschemas und SMTP                                     |
| `src/app/api/[...path]/route.ts`                | API, Autorisierung und CSRF                                 |
| `src/app/[...page]/page.tsx`                    | Geschützte Seiten und Auth-Einstiege                        |
| `src/components/workspace.tsx`                  | Dashboards, Kalender und Verwaltungsoberfläche              |
| `src/proxy.ts`, `next.config.ts`                | CSP und HTTP-Sicherheitsheader                              |
| `tests/`, `docs/ARCHITECTURE.md`                | Automatisierte Prüfungen und Architekturplan                |

## Bewusste Grenzen

- Kein automatischer Passwort-Reset per E-Mail und keine E-Mail-Verifizierung. Administratoren übermitteln manuell erzeugte Reset-Links über einen geeigneten privaten Kanal. Angemeldete Benutzer können ihr Passwort weiterhin mit dem bisherigen Passwort ändern.
- Keine automatischen Erinnerungen, Versandwarteschlange oder automatischen Wiederholungsversuche; dafür ist die Mail-Schnittstelle vorbereitet.
- Keine echte SMTP-Zustellung ohne vom Betreiber eingerichteten Mailserver überprüfbar. Die SMTP-Testfunktionen prüfen die konkrete Installation.
- Listen der Termine sind derzeit auf 2.000 Datensätze begrenzt, das Audit-Fenster auf die letzten 200 Einträge. Für größere Installationen sind Pagination und Archivierung zu ergänzen.
- Profilbilder sind optionale externe HTTPS-URLs, kein Datei-Upload. Externe Bildanbieter erhalten dabei Browseranfragen.
- Die Datenschutzseite erklärt den privaten Betrieb. Konkrete Betreiberangaben und Aufbewahrungsfristen müssen zum tatsächlichen Einsatz passen.
- Abgelaufene Sessions und Rate-Limit-Einträge können regelmäßig anhand von `expiresAt` bzw. `resetAt` gelöscht werden. Audit-/Termindaten nur entsprechend der festgelegten Aufbewahrung bereinigen.
