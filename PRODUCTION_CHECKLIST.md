# CageDB – Produktionscheckliste

Diese Checkliste trennt lokal nachgewiesene Eigenschaften von Prüfungen, die erst im eigenen Supabase-/GitHub-Projekt möglich sind.

## Lokal abgeschlossen

- [x] Vanilla HTML, CSS und JavaScript-ES-Module ohne Build-Schritt
- [x] Hash-Routing für alle dynamischen Ansichten
- [x] unveränderlicher Pub/Sub-State ohne beschreibbare globale App-Variable
- [x] öffentliche Abfragen explizit auf veröffentlichte Datensätze begrenzt
- [x] Relationsabfragen auf veröffentlichte Film-UUIDs begrenzt
- [x] externe Scores öffentlich nur mit Quelle und Abrufdatum
- [x] Auth-UI rendert keine Pflegefunktionen vor Session- und Allowlist-Prüfung
- [x] Adminmutationen ausschließlich über den Supabase-Client und damit RLS
- [x] Lösch- und Veröffentlichungsbestätigungen
- [x] feste Whitelists für Import und Export
- [x] Posterdateityp und 8-MB-Grenze in Browser, Bucket und Storage-Policy
- [x] Content Security Policy und restriktive Referrer-Policy
- [x] kein Server-Schlüssel oder Quelldatensatz unter `public/`
- [x] Filmstatus ausschließlich aus persönlicher Bewertung abgeleitet
- [x] responsive Hell-/Dunkel-/System-Themes
- [x] `prefers-reduced-motion` in CSS und WAAPI
- [x] Tastaturoption für Watchlist-Priorisierung
- [x] Texttabellen für Statistikdiagramme
- [x] XSS-Maskierung dynamischer Werte
- [x] automatisierte Unit-, Integrations-, Sicherheits- und Kontrasttests

## Im eigenen Supabase-Projekt zu prüfen

- [ ] alle sieben Migrationen erfolgreich ausgeführt
- [ ] `rls_policies.test.sql` vollständig grün
- [ ] `initial_import_rpc.test.sql` vollständig grün
- [ ] genau ein bestätigter Auth-Benutzer vorhanden
- [ ] Benutzer-UUID über das Bootstrap-SQL freigeschaltet
- [ ] öffentliche Registrierung und anonyme Anmeldung deaktiviert
- [ ] Login als Admin erfolgreich
- [ ] authentifizierter Nicht-Admin sieht keine Pflegefunktionen und kann nicht schreiben
- [ ] anonymer Browser sieht nur veröffentlichte Filme
- [ ] Entwürfe bleiben auch während paralleler Admin-Session aus öffentlichen Ansichten ausgeschlossen
- [ ] Posterupload, öffentliche Poster-URL und Posterentfernung erfolgreich
- [ ] Veröffentlichung und Löschung erfordern sichtbare Bestätigung
- [ ] CSV-Backup lässt sich herunterladen und in einer Tabellenkalkulation öffnen

## Datenfreigabe

- [ ] verbindliche XLSX-Vorschau geprüft
- [ ] Zeilenzahl und beide Konfliktgruppen bestätigt
- [ ] Erstimport-Dry-Run geprüft
- [ ] Erstimport mit lokalem Secret Key ausgeführt
- [ ] Import-Secret danach aus der Shell entfernt oder rotiert
- [ ] 25 Titelfragmente manuell geprüft, sofern sie in der XLSX gleich vorliegen
- [ ] fehlende deutsche Titel bewusst leer gelassen oder redaktionell ergänzt
- [ ] Genres manuell ergänzt; keine automatische Erfindung
- [ ] Posterrechte geprüft
- [ ] externe Scores mit HTTPS-Quelle und Abrufdatum vervollständigt
- [ ] Bio, Fakten, Zitate, Releases und Verbindungen quellenbasiert gepflegt
- [ ] gewünschte Filme einzeln bestätigt veröffentlicht
- [ ] erstes CSV-Backup nach der redaktionellen Freigabe erstellt

## GitHub Pages und Browser-Smoke-Test

- [ ] `public/js/config.js` enthält Project URL und Publishable Key
- [ ] Repository enthält keine `.env`, Importquelle, Logs oder Secrets
- [ ] GitHub Pages nutzt GitHub Actions als Quelle
- [ ] Paket- und Deployment-Job erfolgreich
- [ ] Reload funktioniert auf allen Hash-Routen
- [ ] Chrome, Firefox, Safari und Edge in aktuellen Versionen geprüft
- [ ] mobile Ansichten ab 320 px geprüft
- [ ] vollständige Tastaturrunde ohne Fokusverlust
- [ ] Screenreader-Smoke-Test für Navigation, Filter, Tabellen, Dialoge und Live-Ansagen
- [ ] Hell, Dunkel und System geprüft
- [ ] Betriebssystem-Einstellung „Bewegung reduzieren“ geprüft
- [ ] private Browser-Session zeigt nur freigegebene Inhalte
- [ ] Supabase Auth Site URL entspricht der finalen Pages-URL
