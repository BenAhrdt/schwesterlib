# Wiederaufnahme nach LXC-Absturz – 8. September 2026

Die vorhandene Implementierung wurde weiterverwendet. Kein Neuaufbau erforderlich.

## Erneut geprüft

- TypeScript: erfolgreich.
- ESLint: erfolgreich, auch nach der Konfigurationsänderung.
- Vitest mit separater PostgreSQL-17-Testdatenbank: alle 23 Tests erfolgreich.
- Initiale SQL-Migration: auf leerer Testdatenbank erfolgreich.
- Produktionsbuild: erfolgreich mit `NODE_OPTIONS=--max-old-space-size=2048 npm run build`.
- Browserprüfung: erfolgreich. Vollständiger Ablauf mit Admin-Setup, Einladung, Provider-Verfügbarkeit, Login, mobilen Breitenprüfungen, Buchung, Verschiebung, Absage, API-Rechten und Tag-/Woche-/Monatskalender.

Bei der Fortsetzung behoben: Auswahlfelder erhalten einen eindeutigen zugänglichen Namen; gedrehte Dekokreise erzeugen auf der mobilen Startseite keinen horizontalen Überlauf mehr. Zwei mehrdeutige Browser-Testabfragen wurden auf das Loginformular bzw. die Terminart präzisiert.

`next.config.ts` begrenzt Build-Worker auf einen und aktiviert die in den installierten Next.js-Dokumenten beschriebene Webpack-Speicheroptimierung. Das reduziert Lastspitzen, belegt aber keine Ursache der früheren Abstürze.

## Betriebszustand bei Wiederaufnahme

Die konfigurierte Anwendungsdatenbank auf webDev war zunächst nicht erreichbar. Für die Tests wurde eine isolierte Instanz unter `/tmp/schwesterlib-check-db` und ausschließlich die Datenbank `schwesterlib_test` verwendet. Diese ist keine dauerhafte Anwendungsdatenbank. Die vorhandene `.env` wurde nicht verändert. Inzwischen hat der Betreiber bestätigt: Auf dem separaten Produktions-LXC läuft PostgreSQL in Docker mit persistentem Volume, und der erste Administrator ist bereits angelegt. Diese Produktionsdatenbank darf nicht neu initialisiert werden.

Bei der späteren Fortsetzung ist das vom Benutzer angelegte Git-Repository verfügbar (Ausgangscommit `e2ffd8b`). Der bestätigte Produktionsstand und der geplante Umzug von `/root/schwesterlib` nach `/srv/schwesterlib` sind in `docs/PRODUCTION.md` dokumentiert. Dienst und Deployment-Scripts sind vorbereitet, aber nicht auf dem Produktions-LXC installiert.

Start- und Einrichtungsanleitung sowie bewusste Funktionsgrenzen stehen in `README.md`.

## Behandlerentwürfe und E-Mail-Benachrichtigungen

Offene Behandlereinladungen erhalten ein vorbereitbares Profil ohne Benutzerkonto. Annahme verknüpft dieses Profil atomar mit dem neuen Konto. Entwürfe bleiben aus Katalog und Slotberechnung ausgeschlossen. Die neue Migration `202609080002_provider_drafts_notifications` erhält vorhandene Konten und Termine und legt Entwürfe für offene Behandlereinladungen nachträglich an. Vor dem späteren Produktionsupdate sichern und Migrationen ausführen; hier wurde nur die Testdatenbank migriert.

Der neue Schalter im Behandlerprofil aktiviert organisatorische E-Mails bei Buchung, Verschiebung und Absage. Standard ist aus; SMTP und eine Kontoadresse sind erforderlich. Pushnachrichten bleiben ein späterer Schritt.

Geprüft: 36 Unit-/Integrationstests plus ein Migrationstest mit altem Datenbestand, außerdem der erweiterte vollständige Browsertest mit Entwurfsbearbeitung und Übernahme bei Annahme. Typecheck, Linter und Produktionsbuild erfolgreich. E-Mail-Verhalten mit simuliertem Transport getestet; kein Versand über den Produktions-Mailserver ausgeführt.

## Version 1.2.0

Die Behandleransicht „Meine Termine“ berücksichtigt jetzt auch Termine, die andere Benutzer bei diesem Behandler gebucht haben. Die Updatefunktion liegt unter **Administration → Einstellungen**. Sie prüft veröffentlichte GitHub-Releases und reicht Installationsaufträge an einen getrennten systemd-Helfer weiter. Dieser muss nach dem Konsolenupdate auf 1.2.0 einmalig mit `scripts/install-web-updater.sh` eingerichtet werden. Die Webanwendung erhält keine Root-, Docker- oder systemd-Rechte.
