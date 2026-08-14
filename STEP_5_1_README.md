<!-- STEP_5_1_README.md -->
# CageDB – Schritt 5.1: Datenzugriff und Startseite

> Historischer Zwischenstand. Filmarchiv, Admin, Statistik und spielerische Module sind inzwischen implementiert; maßgeblich ist `README.md`.

Dieser Projektstand bindet erstmals veröffentlichte Supabase-Daten an die öffentliche App an. Er ergänzt den Schritt-4-Unterbau um eine getestete Domain-Schicht, einen schmalen RLS-geschützten Datenservice und die vollständigen Datenzustände der Startseite. Es wurden weiterhin keine Supabase-Ressourcen angelegt, Daten importiert, Konten erstellt oder Deployments ausgeführt.

## Funktionsumfang

- lädt ausschließlich `published = true` angefragte Filme und begrenzt Metriken auf genau deren UUIDs;
- verlässt sich zusätzlich auf die bestehenden RLS-Policies als Datenbankgrenze;
- berechnet gesehen/Watchlist ausschließlich aus `my_rating_percent`;
- berechnet Anzahl gesehen, Watchlist, persönliche Durchschnittsbewertung und vier Cage-o-meter-Schnellwerte;
- wählt den Film des Tages ausschließlich aus veröffentlichten Watchlist-Filmen;
- verwendet für die Tagesgrenze explizit `Europe/Berlin`;
- bleibt bei gleicher Berliner Kalenderdatei und gleicher stabil sortierter Kandidatenliste deterministisch;
- zeigt Lade-, Konfigurations-, Netzwerk-, Datenvertrags- und Leerzustände ohne erfundene Inhalte;
- nutzt den Storage-Pfad nur zur Erzeugung einer HTTPS-URL desselben Supabase-Hosts;
- fällt bei fehlendem oder defektem Poster auf den gestalteten CageDB-Platzhalter zurück;
- lässt alle Adminrouten bis zur Auth-Implementierung verriegelt.

## Modulaufteilung

| Datei | Verantwortung |
|---|---|
| `public/js/domain/home-catalog.mjs` | Normalisierung, Source-of-Truth-Regel, Statistiken, Berlin-Datum, stabile Tagesauswahl |
| `public/js/services/public-config.mjs` | Validierung der öffentlichen Project URL und des Publishable Keys |
| `public/js/services/public-catalog.mjs` | Eng begrenzte öffentliche Supabase-Abfragen und sichere Fehlerklassifikation |
| `public/js/services/supabase-client.js` | Gepinnter Browser-Client über ESM-CDN, PKCE und Session-Speicher |
| `public/js/app-state.mjs` | Unveränderlicher Zustand `idle → loading → ready/empty/error` |
| `public/js/app.mjs` | Laden beim ersten Startseitenbesuch, Retry, Live-Ansagen und Poster-Fallback |
| `public/js/views.mjs` | Semantische Startseitenzustände und HTML-Escaping |

Der Service importiert den CDN-Client erst nach erfolgreicher Konfigurationsprüfung. Dadurch bleibt die lokale App-Shell mit Platzhaltern funktionsfähig und zeigt einen verständlichen Konfigurationszustand, ohne unnötig das CDN anzufragen.

## Öffentlicher Datenvertrag

Die Startseite liest nur die benötigten Felder:

- `films`: UUID, Legacy-ID, Jahr, Titel, persönliche Bewertung und Posterpfad;
- veröffentlichte Zuordnungen aus `film_genres` und `genres`;
- die vier optionalen Werte aus `film_metrics`.

Es werden keine Adminfelder, Authdaten oder externen Score-Zeilen für die Startseite abgefragt. Metrik- und Zuordnungsabfragen erhalten nur die UUIDs der zuvor geladenen veröffentlichten Filme; Genres werden zusätzlich explizit mit `published = true` angefragt. Dadurch bleibt auch eine parallel aktive Admin-Session für das öffentliche Startseitenmodell auf veröffentlichte Datensätze und Genres begrenzt. `watched` wird im Client nicht als zweite Wahrheit verwendet: `my_rating_percent !== null` bedeutet gesehen, einschließlich einer legitimen Bewertung von `0` Prozent.

Nicht-null Werte außerhalb der Datenbank-Constraints führen zu einem neutralen Datenvertragsfehler. Rohmeldungen aus Supabase werden nicht in UI oder State übernommen.

## Deterministischer Film des Tages

1. Nur Filme ohne persönliche Bewertung gelangen in die Kandidatenliste.
2. Die Liste wird ohne locale-abhängige Sortierung stabil nach `legacy_import_id` und UUID sortiert.
3. Das Berliner Datum wird über `Intl.DateTimeFormat(..., { timeZone: "Europe/Berlin" })` in `YYYY-MM-DD` zerlegt.
4. Datum, Zeitzone und stabile Kandidaten-IDs bilden den FNV-1a-Seed.
5. Der Hash modulo Kandidatenzahl bestimmt den Index.

Damit liefern Reloads am selben Berliner Kalendertag dieselbe Auswahl. Eine redaktionelle Änderung der veröffentlichten Watchlist darf die Auswahl bewusst ändern, weil die Kandidatenliste Bestandteil des Seeds ist.

## Kennzahlen

- **Gesehen:** Anzahl Filme mit persönlicher Bewertung, auch `0` Prozent.
- **Watchlist:** Anzahl Filme ohne persönliche Bewertung.
- **Ø Bewertung:** arithmetisches Mittel ausschließlich der vorhandenen persönlichen Bewertungen, eine Nachkommastelle.
- **Cage-o-meter:** jede Dimension mittelt nur vorhandene 0–5-Werte; `0` ist ein echter Wert, `NULL` bedeutet nicht bewertet. Der Gesamtwert mittelt alle vorhandenen Dimensionswerte.

Bei fehlenden Bewertungen oder Metriken zeigt die UI einen erklärten Gedankenstrich statt `0`, weil beides semantisch verschieden ist.

## Konfiguration

In `public/js/config.js` bleiben Project URL und Publishable Key öffentliche Werte:

```js
// public/js/config.js
supabaseUrl: "https://DEIN_PROJECT_REF.supabase.co",
supabaseAnonKey: "DEIN_SB_PUBLISHABLE_KEY",
```

HTTP wird nur für `localhost`, `127.0.0.1` und `::1` akzeptiert. Produktive URLs müssen HTTPS verwenden.

## Lokaler Import-Key

Das Importwerkzeug bevorzugt jetzt `SUPABASE_SECRET_KEY`. `SUPABASE_SERVICE_ROLE_KEY` bleibt für bestehende lokale Setups als Legacy-Fallback erhalten. Sind beide unterschiedlich gesetzt, stoppt der Import, statt uneindeutig einen Schlüssel auszuwählen.

Für einen Commit muss Deno beide erlaubten Namen lesen dürfen:

```bash
# tools/initial-import/README.md — erlaubte Importumgebung
--allow-env=SUPABASE_URL,SUPABASE_SECRET_KEY,SUPABASE_SERVICE_ROLE_KEY
```

Keiner dieser Server-Schlüssel darf in `public/`, Git, Logs oder Chat stehen.

## Lokal prüfen

```bash
# STEP_5_1_README.md — vollständige Tests
node --test tests/*.test.mjs tools/initial-import/import-core.test.mjs
```

```bash
# STEP_5_1_README.md — JavaScript-Syntax
find public/js tools/initial-import -type f \( -name '*.js' -o -name '*.mjs' \) \
  -exec node --check {} \;
```

```bash
# STEP_5_1_README.md — lokale Vorschau
python3 -m http.server 8080 --directory public
```

Mit den unveränderten Platzhaltern zeigt `http://localhost:8080/#/` absichtlich den Konfigurationszustand. Nach Eintragen der öffentlichen Werte lädt die Startseite echte, durch RLS gefilterte Daten.

Der GitHub-Pages-Workflow führt Unit- und Syntaxprüfungen jetzt vor dem Verpacken aus. Nicht ersetzte Platzhalter oder Server-Key-Marker in `public/` stoppen das Deployment weiterhin.

## Automatisierte Nachweise

Die Tests decken insbesondere ab:

- Berliner Datumswechsel an der UTC-Tagesgrenze;
- identische Tagesauswahl bei umgekehrter Quellreihenfolge;
- Ausschluss gesehener Filme aus der Tagesauswahl;
- `0` Prozent als gesehen und `0` beim Cage-o-meter als realer Wert;
- Mittelwerte mit `NULL`-Lücken;
- Titel-, Genre-, Metrik- und Poster-Normalisierung;
- expliziten `published = true`-Filter im Supabase-Service;
- neutrale Fehlercodes ohne Backenddetails;
- HTML-Escaping echter Startseitendaten;
- unverändert verriegelte Adminrouten und lokale ARIA-Referenzen.

## Grenze dieses Teilpakets

- Das Filmarchiv und die Detailseite bleiben inhaltlich noch Platzhalter; ihre Umsetzung folgt in Schritt 5.2.
- Auth, Login und Admin-CRUD folgen in Schritt 5.3/5.4.
- Statistik-, Bio- und Spielmodule folgen danach.
- Ohne veröffentlichte Datensätze ist die öffentliche Startseite korrekt leer. Der Erstimport legt weiterhin ausschließlich Entwürfe an.
