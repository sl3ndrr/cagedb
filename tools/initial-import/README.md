<!-- tools/initial-import/README.md -->
# CageDB: lokaler Erstimport

Dieses Werkzeug ist ausschließlich für den einmaligen, lokalen Erstimport gedacht. Es gehört nicht zum statisch ausgelieferten Frontend und liest den bevorzugten Supabase Secret Key nur beim expliziten `--commit` aus der lokalen Prozessumgebung. Der bisherige Variablenname für den Legacy-Service-Role-Key bleibt vorübergehend als Fallback unterstützt.

## Sicherheits- und Datenregeln

- Standard ist immer ein Dry-Run ohne Datenbankzugriff.
- Nur `--commit` ruft die atomare RPC `public.import_initial_films(jsonb)` auf.
- Die RPC ist für `anon` und `authenticated` gesperrt und nur `service_role` gewährt.
- Der Browser, `public/`, Git, Logs und Chat dürfen weder Secret Key noch Legacy-Service-Role-Key enthalten.
- Das Payload besitzt exakt acht erlaubte Felder. `watched` und `status` werden nur für die Konfliktvorschau gelesen und nie gespeichert.
- Unbekannte Quellspalten werden vollständig verworfen. Die Ausgabe nennt nur deren Anzahl, nie Namen oder Werte.
- Eine Bewertung bedeutet gesehen; keine Bewertung bedeutet Watchlist.
- Neu angelegte Filme erhalten `published = false`; ein erneuter Lauf verändert bestehende Veröffentlichungszustände nicht.
- Externe Scores ohne URL und Abrufdatum werden gespeichert, bleiben durch RLS aber öffentlich unsichtbar.
- Ein erneuter Lauf upsertet per `legacy_import_id`. Bereits mit Provenienz gepflegte externe Scores werden nicht überschrieben oder gelöscht.

## Voraussetzungen

1. Die Migrationen `20260814000100` bis `20260814000700` wurden in Reihenfolge ausgeführt.
2. Deno 2 ist lokal installiert.
3. Die verbindliche XLSX-Datei enthält das Tabellenblatt `Films`. Liegt daneben eine passende CSV-Datei, wird XLSX bevorzugt.
4. Die Quelldatei liegt außerhalb des Repositories, beispielsweise in einem ignorierten lokalen Verzeichnis.

## 1. Dry-Run

CSV benötigt nur Leserechte:

```bash
# tools/initial-import/README.md — CSV-Dry-Run
deno run --no-prompt \
  --allow-read=/ABSOLUTER/PFAD/ZU/DEN/DATEN \
  tools/initial-import/import-films.mjs \
  --input /ABSOLUTER/PFAD/ZU/DEN/DATEN
```

Für XLSX darf Deno zusätzlich die gepinnte ExcelJS-Abhängigkeit von `esm.sh` laden:

```bash
# tools/initial-import/README.md — XLSX-Dry-Run
deno run --no-prompt \
  --allow-read=/ABSOLUTER/PFAD/ZU/DEN/DATEN \
  --allow-import=esm.sh \
  tools/initial-import/import-films.mjs \
  --input /ABSOLUTER/PFAD/ZU/DEN/DATEN
```

Vor dem Schreiben müssen Zeilenzahl, Datenlücken und beide Konfliktgruppen geprüft werden. Bei einer vom erwarteten Wert 109 abweichenden legitimen Quelle muss die neue Zahl bewusst mit `--expect-count` angegeben werden.

## 2. Lokale Umgebungsvariablen setzen

`.env.example` dokumentiert die Namen nur; das Frontend liest keine `.env`-Datei. Setze `SUPABASE_URL` und bevorzugt `SUPABASE_SECRET_KEY` mit dem lokalen Secret-Manager oder in der aktuellen Shell. `SUPABASE_SERVICE_ROLE_KEY` wird nur als Legacy-Fallback gelesen. Sind beide gesetzt und unterschiedlich, stoppt das Werkzeug. Gib keinen Key als CLI-Argument ein, weil er sonst in der Shell-Historie landen kann.

## 3. Commit

Ersetze Host und Datenpfad, nicht aber die Variablennamen:

```bash
# tools/initial-import/README.md — atomarer Commit
deno run --no-prompt \
  --allow-read=/ABSOLUTER/PFAD/ZU/DEN/DATEN \
  --allow-env=SUPABASE_URL,SUPABASE_SECRET_KEY,SUPABASE_SERVICE_ROLE_KEY \
  --allow-import=esm.sh \
  --allow-net=DEIN_PROJECT_REF.supabase.co \
  tools/initial-import/import-films.mjs \
  --input /ABSOLUTER/PFAD/ZU/DEN/DATEN \
  --commit
```

Falls die Vorschau Konflikte ausweist, stoppt der Commit zusätzlich. Erst nach manueller Prüfung darf `--accept-conflicts` ergänzt werden. Die aufgelistete Auflösung bleibt dabei unverändert: Bewertung sticht, ohne Bewertung bleibt der Film Watchlist.

## Tests

Der reine Importkern benötigt keine Pakete und kann mit Node getestet werden:

```bash
# tools/initial-import/README.md — Unit-Tests
node --test tools/initial-import/import-core.test.mjs
```

Das Werkzeug gibt weder Rohzeilen noch Umgebungsvariablen aus. Bei Supabase-Fehlern werden nur Fehlercode und Kurzmeldung, nicht die potenziell datenhaltigen Details ausgegeben.
