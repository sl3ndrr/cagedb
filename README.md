# CageDB

CageDB ist eine produktionsbereite, statisch auslieferbare Nicolas-Cage-Filmdatenbank mit öffentlichem Archiv und privater Single-Admin-Oberfläche. Das Frontend besteht ausschließlich aus HTML, CSS und modernen JavaScript-ES-Modulen. Supabase stellt Postgres, Auth, Storage und Row Level Security bereit.

Es wurden in diesem Projektstand keine Konten angelegt, keine Infrastruktur verändert, keine Daten live importiert und kein Deployment gestartet.

## Funktionsumfang

### Öffentlich

- deterministischer Film des Tages aus veröffentlichten Watchlist-Filmen, Tagesgrenze `Europe/Berlin`;
- globale Kennzahlen und Cage-o-meter-Schnellwert;
- Filmarchiv mit Suche sowie Filtern nach Jahr, Jahrzehnt, Genre, „Ohne Genre“, Status, Bewertung und Tag;
- Filmansicht mit Titel-Fallback, Notizen, Genres, Tags, Cage-o-meter, Poster-Fallback und ausschließlich belegten externen Scores;
- Statistik für Jahrzehnte, Genres, Top/Flop, Fortschritt und Running-Gags;
- zugängliche Datentabellen als vollständige Alternative zu Balkendiagrammen;
- redaktionelle Biografie, interaktive Timeline sowie Fakten und Zitate nur mit Quellenangabe;
- kommende Veröffentlichungen nur als geprüfte, quellenbasierte Einträge;
- Wall of Fame, Watchlist-Losrad und Cage-Universe-Liste.

### Privat

- E-Mail-/Passwort-Login über Supabase Auth;
- zweite serverseitige Adminprüfung über `private.admin_users` und `public.is_admin()`;
- kein Rendern von Admininhalten vor bestätigter Session und Allowlist-Mitgliedschaft;
- Dashboard sowie Film-, Genre-, Tag- und redaktionelles CRUD;
- persönliche Bewertung als einzige Quelle für „gesehen“;
- Notizen, Genres, Tags, Cage-o-meter und belegte RT-/IMDb-Werte;
- Poster-Upload in den öffentlichen `film-posters`-Bucket, Schreibzugriff nur für Admin;
- Watchlist-Priorisierung per Drag-and-drop und über beschriftete Tastatur-Schaltflächen;
- CSV-Korrekturvorschau mit beiden Status-/Bewertungskonflikten;
- idempotentes Korrektur-Upsert über `legacy_import_id`;
- CSV-Backup mit festem, privacy-sicherem Spaltensatz;
- Bestätigungsdialoge vor Veröffentlichung und Löschung.

## Architektur

| Bereich | Umsetzung |
|---|---|
| Hosting | statisches `public/` auf GitHub Pages |
| Routing | Hash-Router, zum Beispiel `#/film/<uuid>` |
| State | kleiner unveränderlicher Pub/Sub-Store |
| Datenclient | gepinnter Supabase-Client über ESM-CDN |
| Datenbank | idempotente SQL-Migrationen |
| Auth | genau ein freigeschalteter E-Mail-/Passwort-Admin |
| Sicherheit | Grants, RLS, private Admin-Allowlist, CSP, feste Payload-Whitelists |
| Motion | CSS und Web Animations API mit `prefers-reduced-motion` |
| Themes | System, Hell und Dunkel |

Wichtige Module:

- `public/js/domain/home-catalog.mjs`: Datenvertrag, Statistiken und tägliche Auswahl;
- `public/js/domain/catalog.mjs`: Archivfilter, Auswertungen und Losrad;
- `public/js/domain/admin-csv.mjs`: Browser-CSV-Vorschau und Backup;
- `public/js/services/public-catalog.mjs`: explizit öffentliche, relationsgesicherte Abfragen;
- `public/js/services/admin-api.mjs`: Authprüfung und RLS-gesicherte Adminoperationen;
- `public/js/app.mjs`: Controller, State-Übergänge und DOM-Ereignisse;
- `public/js/views.mjs`: maskierte, semantische UI-Ausgabe;
- `supabase/migrations/`: Schema, Trigger, RLS, Storage und Import-RPC;
- `tools/initial-import/`: lokales Deno-Werkzeug für den kontrollierten Erstimport.

## Datenregeln

- `my_rating_percent IS NOT NULL` bedeutet gesehen, auch bei `0` Prozent.
- `my_rating_percent IS NULL` bedeutet Watchlist.
- Ein Quellstatus wird nur in der Importvorschau ausgewertet und nie gespeichert.
- Interne UUIDs sind Primärschlüssel; `legacy_import_id` ist die eindeutige Importkennung.
- Fehlende Werte bleiben leer.
- Es werden keine Genres, Poster, Scores, Fakten, Zitate oder Cage-o-meter-Werte erfunden.
- Filme ohne Genre verwenden den neutralen Fallback und bleiben über „Ohne Genre“ filterbar.
- Externe Scores sind öffentlich nur mit HTTPS-Quelle und Abrufdatum lesbar.
- Neue Erstimport- und Korrekturdatensätze bleiben standardmäßig unveröffentlicht.

## Routen

| Hash | Ansicht |
|---|---|
| `#/` | Start / Film des Tages |
| `#/filme` | Filmarchiv |
| `#/film/:id` | Filmdetail |
| `#/statistik` | Statistik |
| `#/bio` | Bio, Timeline und kommende Veröffentlichungen |
| `#/wall-of-fame` | Wall of Fame |
| `#/losrad` | Watchlist-Losrad |
| `#/cage-universe` | Verbindungsansicht |
| `#/admin/login` | Admin-Anmeldung |
| `#/admin` | Admin-Dashboard |
| `#/admin/filme` | Filme und Watchlist-Priorität |
| `#/admin/genres` | Genres und Tags |
| `#/admin/import` | CSV-Korrekturen und Backup |
| `#/admin/redaktion` | Bio, Releases und Verbindungen |

## Lokale Verifikation

Node.js 22 oder neuer wird für die Tests empfohlen. Die Anwendung selbst benötigt keinen Node-Server.

```bash
node --test tests/*.test.mjs tools/initial-import/import-core.test.mjs
```

```bash
find public/js tools/initial-import -type f \( -name '*.js' -o -name '*.mjs' \) \
  -exec node --check {} \;
```

```bash
python3 -m http.server 8080 --directory public
```

Danach `http://localhost:8080/#/` öffnen. Direktes Öffnen über `file://` ist wegen ES-Modulen nicht vorgesehen.

## Supabase-Setup

Migrationen exakt in dieser Reihenfolge ausführen:

1. `20260814000100_foundation_and_admin.sql`
2. `20260814000200_catalog_schema.sql`
3. `20260814000300_editorial_schema.sql`
4. `20260814000400_triggers.sql`
5. `20260814000500_grants_and_rls.sql`
6. `20260814000600_poster_storage.sql`
7. `20260814000700_initial_import_rpc.sql`

Danach beide Testdateien ausführen:

- `supabase/tests/rls_policies.test.sql`
- `supabase/tests/initial_import_rpc.test.sql`

Der Admin wird erst anschließend nach `supabase/bootstrap/grant_initial_admin.sql` angelegt. Die vollständige, schrittweise Anleitung steht in `CageDB_Handlungsanleitung.md` des Übergabepakets.

## Browser-Konfiguration

Nur die zwei öffentlichen Werte in `public/js/config.js` ersetzen:

```js
supabaseUrl: "https://DEIN_PROJECT_REF.supabase.co",
supabaseAnonKey: "DEIN_PUBLISHABLE_KEY",
```

Kein Secret Key, Datenbankpasswort oder Connection String darf in `public/`, Git oder Chat landen. Eine `.env` wird vom statischen Frontend nicht gelesen. `.env.example` dokumentiert ausschließlich spätere beziehungsweise lokale Servervariablen.

## Erstimport

Der Erstimport wird außerhalb des Frontends lokal mit Deno ausgeführt. Standard ist ein Dry-Run. Erst `--commit` liest den lokalen Secret Key und ruft die atomare, service-role-only RPC auf. XLSX wird gegenüber einer danebenliegenden CSV bevorzugt.

Details und Befehle: `tools/initial-import/README.md`.

## Deployment

`.github/workflows/deploy-pages.yml` führt Tests, Syntaxprüfung, Secret-/Quelldatenscan und Konfigurationsprüfung aus. Nur bei Erfolg wird ausschließlich `public/` als GitHub-Pages-Artefakt verpackt. Der Workflow enthält keine Supabase-Secrets.

Vor dem ersten Deployment:

1. öffentliche Konfiguration eintragen;
2. alle Tests lokal ausführen;
3. Supabase RLS testen und Admin bootstrapen;
4. redaktionelle Inhalte prüfen und gezielt veröffentlichen;
5. in GitHub Pages „GitHub Actions“ als Quelle wählen;
6. die finale Pages-URL in Supabase Auth als Site URL eintragen.

## Barrierefreiheit

- semantische Landmarken und genau eine Hauptüberschrift je Route;
- Skip-Link und Fokusmanagement nach Navigation;
- sichtbarer `:focus-visible`-Zustand;
- vollständige Tastaturbedienung einschließlich Watchlist-Sortierung;
- Live-Regionen für Laden, Mutation, Losrad und Navigation;
- Statusinformationen zusätzlich als Text, nicht nur Farbe;
- Diagramme mit Datentabellen;
- native `details`/`summary`-Timeline;
- reduzierte Motion in CSS und WAAPI;
- getestete AA-Kontraste der primären Farbpaarungen;
- gestalteter Poster-Fallback ohne defekte Bildlinks.

## Bewusste Betriebsgrenzen

- genau ein Admin, keine Registrierung und keine öffentlichen Benutzerkonten;
- keine Kommentare oder öffentlichen Bewertungen;
- keine Undo-/Versionshistorie außer CSV-Backups;
- kein Scraping;
- keine automatische Genreanreicherung;
- keine TMDB-Anbindung im MVP;
- keine Passwort-Reset-Oberfläche im MVP; Wiederherstellung erfolgt bei Bedarf über den vertrauenswürdigen Supabase-Dashboard-Prozess.

## Mitwirkende

[<img src="https://avatars.githubusercontent.com/u/267193182?s=64&v=4" width="32" height="32" alt="Codex-Profilbild">](https://github.com/codex)

[Codex](https://github.com/codex) hat zu diesem Projekt beigetragen.
