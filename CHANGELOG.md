# Changelog

Alle wesentlichen Änderungen an SchwesterLib werden in dieser Datei dokumentiert.

## [1.4.0] – 2026-09-09

### Neu

- Freiwillige Push-Benachrichtigungen bei Buchungen, Verschiebungen und Absagen für Patienten und Behandler; unabhängig von E-Mail.
- Eigene Benachrichtigungseinstellungen mit nachträglicher Aktivierung, Anleitung bei blockierter Berechtigung, Testnachricht und Deaktivierung pro Gerät.
- Optionale Erinnerungen an eigene Termine, automatischer Erinnerungsprozess sowie Unterstützung für die Installation auf dem Home-Bildschirm.
- Dauerhafte Gerätezuordnung und verschlüsselte Push-Schlüssel; Entfernung der Zuordnung beim Abmelden und Bereinigung abgelaufener Abonnements.

### Behoben

- Behandler sehen bei Terminarten keine Auswahl anderer Behandler mehr. Eigene Terminarten werden automatisch dem eigenen Profil zugeordnet; gemeinsame Terminarten bleiben für Behandler schreibgeschützt.

## [1.3.0] – 2026-09-08

### Neu

- Administratoren können in der Benutzerverwaltung einen eine Stunde gültigen, einmal verwendbaren Link zum Zurücksetzen eines vergessenen Passworts erzeugen und kopieren.
- Benutzer vergeben über den Reset-Link selbst ein neues Passwort; der Administrator sieht weder das alte noch das neue Passwort.
- Nach erfolgreichem Zurücksetzen werden alle Sitzungen des betroffenen Kontos beendet. Erstellung und Verwendung des Links werden im Audit-Protokoll erfasst.

### Sicherheit

- Reset-Token werden ausschließlich als SHA-256-Hash gespeichert. Ein neuer Link widerruft vorherige Reset-Links dieses Kontos; deaktivierte Konten können keinen Reset-Link verwenden.

## [1.2.0] – 2026-09-08

### Behoben

- Bei einem Behandler zeigt „Meine Termine“ jetzt auch Termine an, die andere Personen bei diesem Behandler gebucht haben.

### Neu

- Administratoren können unter **Einstellungen** nach veröffentlichten GitHub-Releases suchen, Release-Hinweise ansehen und ein Update starten.
- Die Updateansicht zeigt Backup, Installation, Migration, Build und Neustart als laufenden Vorgang; nach erfolgreichem Neustart lädt sie automatisch neu.
- Ein separater systemd-Updater installiert ausschließlich veröffentlichte, vorwärtsgerichtete Releases aus dem fest eingetragenen SchwesterLib-Repository. Vor jeder Migration wird PostgreSQL gesichert.

## [1.1.0] – 2026-09-08

### Neu

- Behandlerprofile können bereits mit einer offenen Einladung vorbereitet werden. Leistungen und Verfügbarkeiten bleiben bei der späteren Kontoaktivierung erhalten.
- Optionale E-Mail-Benachrichtigungen für Behandler bei Buchung, Verschiebung und Absage.
- Datenbankmigration für Behandlerentwürfe und Benachrichtigungseinstellungen; bestehende Konten, Termine und die Setup-Sperre bleiben erhalten.
- Gesundheitsendpunkt für Anwendung und Datenbank unter `/api/health`.
- systemd-Dienst für den Betrieb unter einem eigenen Benutzer sowie abgesicherte Scripts für Produktionsupdates und PostgreSQL-Backups.
- Ausführliche Anleitung für Installation, Updates, Reverse Proxy, Backups und Recovery auf dem Produktions-LXC.

### Behoben

- Auswahlfelder besitzen eindeutig zugeordnete Beschriftungen für Browser und assistive Technik.
- Dekorative Elemente verursachen auf schmalen Mobilgeräten keinen horizontalen Überlauf mehr.
- Browserprüfungen verwenden eindeutige Selektoren für Loginfehler und Terminarten.

### Betriebshinweise

- Vor dem Update der Produktionsinstallation ein Datenbankbackup erstellen.
- Beim Update `npm run db:migrate` ausführen; `npm run db:seed` gehört nicht zum Update.
- Die neue E-Mail-Option ist für bestehende und neue Behandler zunächst ausgeschaltet.
- Pushnachrichten und eine Updatefunktion innerhalb der Weboberfläche sind noch nicht enthalten.

## [1.0.0] – 2026-09-08

- Erste vollständige Version mit geschlossenem Einladungssystem, Rollen, Terminverwaltung, Verfügbarkeiten, Kalender, SMTP-Konfiguration und abgesichertem Initial-Setup.

[1.4.0]: https://github.com/BenAhrdt/schwesterlib/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/BenAhrdt/schwesterlib/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/BenAhrdt/schwesterlib/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/BenAhrdt/schwesterlib/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/BenAhrdt/schwesterlib/releases/tag/v1.0.0
