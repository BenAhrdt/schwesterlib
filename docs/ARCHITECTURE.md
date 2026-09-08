# Implementierungsplan und Architektur

1. Next.js App Router, TypeScript, Tailwind und lokale UI-Komponenten; PostgreSQL mit Prisma.
2. Argon2id-Passwörter, iron-session als etablierte Cookie-Verschlüsselung, widerrufbare Datenbank-Sessions. Jede Operation lädt die aktuelle Rolle aus der Datenbank.
3. Setup und Einladungsannahme in Transaktionen mit PostgreSQL Advisory Locks. Persistente Setup-Sperre bleibt auch nach Rollenänderungen erhalten.
4. UTC-Zeitpunkte, lokale Wochenregeln in Europe/Berlin. PostgreSQL Exclusion Constraint verhindert überlappende aktive Buchungen inklusive Pufferzeiten. Provider-Lock serialisiert Änderungen von Kalender und Verfügbarkeiten.
5. Gemeinsame serverseitige Domänenschicht für API, UI und Integrationstests. Explizite Rollen- und Eigentumsprüfungen.
6. Responsive öffentliche Startseite, Buchungsassistent, eigene Termine, Kalender und rollenabhängige Verwaltung.
7. SMTP mit AES-256-GCM-verschlüsseltem Passwort; modularer Versand. Einladungslinks nur einmal angezeigt.
8. Tests gegen echte PostgreSQL-Instanz, Typecheck, ESLint und Produktionsbuild.

Keine öffentliche Registrierung. Keine medizinischen Freitextfelder. Datenbankbasierte Rate Limits funktionieren auch mit mehreren App-Instanzen. Mutierende API-Aufrufe benötigen eine passende Origin. Rollen sind zentral erweiterbar.
