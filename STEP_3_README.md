<!-- STEP_3_README.md -->
# CageDB – Schritt 3: Backend-Logik und Konfiguration

> Historischer Zwischenstand. Für Funktionsumfang und Inbetriebnahme des finalen Projekts gilt die zentrale `README.md`.

Dieser Projektstand ergänzt die Supabase-Datenbank aus Schritt 2 um die statische Browser-Konfiguration, den lokalen Erstimport und den GitHub-Pages-Workflow. Es wurden weder Supabase-Ressourcen angelegt noch Daten importiert oder Deployments gestartet.

## Sicherheitsgrenzen

| Bereich | Erlaubte Zugangsdaten | Schreibweg |
|---|---|---|
| `public/` / Browser | Projekt-URL und öffentlicher Anon-/Publishable-Key | Späterer Admin-Client, immer durch Auth + RLS gesichert |
| Lokales Importwerkzeug | Projekt-URL und Secret Key aus Prozessumgebung; Legacy-Service-Role-Key nur als Fallback | Nur `public.import_initial_films(jsonb)` und nur mit `--commit` |
| GitHub Actions | Keine Supabase-Secrets | Lädt ausschließlich `public/` als statisches Pages-Artefakt hoch |

Secret Key und Legacy-Service-Role-Key dürfen nie in `public/js/config.js`, einer echten `.env` im Repository, einem Commit, einem Log oder im Chat erscheinen. `.env.example` dokumentiert Variablennamen, wird aber von der statischen Website nicht eingelesen.

## Öffentliche Supabase-Konfiguration

In `public/js/config.js` müssen genau diese Platzhalter ersetzt werden:

```js
// public/js/config.js — projektspezifische Werte
supabaseUrl: "https://DEIN_PROJECT_REF.supabase.co",
supabaseAnonKey: "DEIN_OEFFENTLICHER_ANON_ODER_PUBLISHABLE_KEY",
```

Der Key ist öffentlich; die Sicherheit hängt vollständig von den Migrationen und RLS-Policies ab. `public/js/services/supabase-client.js` lädt `@supabase/supabase-js@2.112.3` direkt als ESM, verwendet PKCE und persistiert ausschließlich die Admin-Session im Browser. Weil CageDB Hash-Routing nutzt und keine öffentlichen Registrierungen vorsieht, ist die automatische Interpretation des URL-Fragments durch Supabase Auth deaktiviert.

## Lokale Vorschau

Ein beliebiger statischer Dateiserver genügt. Beispiel:

```bash
# STEP_3_README.md — lokale statische Vorschau
python3 -m http.server 8080 --directory public
```

Direktes Öffnen per `file://` ist wegen ES-Modulen und Browser-Sicherheitsregeln nicht unterstützt.

## Erstimport

1. Migration `supabase/migrations/20260814000700_initial_import_rpc.sql` nach den sechs Migrationen aus Schritt 2 ausführen.
2. Den Dry-Run aus `tools/initial-import/README.md` starten.
3. Zeilenzahl, Datenlücken und beide Konfliktgruppen prüfen.
4. Erst danach lokal mit `--commit` schreiben.

Die RPC akzeptiert exakt acht Felder, ist atomar und upsertet Filme per `legacy_import_id`. `watched` und `status` verlassen die Vorschau nicht. Bestehende redaktionelle Felder, Veröffentlichung, Poster, Genres, Tags und Score-Provenienz werden bei einem erneuten Lauf nicht überschrieben.

## GitHub Pages

Der Workflow `.github/workflows/deploy-pages.yml` folgt dem statischen Pages-Ablauf mit getrennten Paket- und Deployment-Jobs:

1. Repository auschecken.
2. Nicht ersetzte Konfigurationsplatzhalter und Service-Key-Marker in `public/` ablehnen.
3. `public/` ohne Build-Schritt als Pages-Artefakt hochladen.
4. In die geschützte Umgebung `github-pages` deployen.

Vor dem ersten Push in GitHub unter **Settings → Pages → Build and deployment → Source** die Option **GitHub Actions** wählen. Der Workflow startet bei Pushes auf `main` oder manuell. Solange die öffentlichen Platzhalter nicht ersetzt sind, bricht er absichtlich vor dem Upload ab. Dieser Schritt hat selbst kein Deployment ausgeführt.

## Verifikation

```bash
# STEP_3_README.md — Importkern testen
node --test tools/initial-import/import-core.test.mjs
```

```bash
# STEP_3_README.md — JavaScript-Syntax prüfen
node --check tools/initial-import/import-core.mjs
node --check tools/initial-import/import-films.mjs
node --check public/js/config.js
node --check public/js/services/supabase-client.js
```

Der aktuelle `public/index.html` ist bewusst nur eine technische Bereitschaftsseite. HTML-Grundstruktur, Designsystem, Hash-Router und barrierefreie Navigation folgen in Schritt 4.
