# CageDB – lokaler Testbericht

Datum: 14. August 2026  
Umgebung: isolierter Linux-Arbeitsbereich, Node.js verfügbar; kein konfiguriertes Supabase-Projekt, kein Deno, keine Supabase CLI und kein grafischer Browser.

## Erfolgreich ausgeführt

### JavaScript-Tests

```bash
node --test tests/*.test.mjs tools/initial-import/import-core.test.mjs
```

Ergebnis: **54 bestanden, 0 fehlgeschlagen, 0 übersprungen**.

Abgedeckt sind:

- Berliner Tagesgrenze und deterministische Tagesauswahl;
- Bewertung als einzige Gesehen-Quelle einschließlich 0 Prozent;
- Normalisierung von Titeln, Genres, Metriken und Poster-URLs;
- Archivsuche und kombinierte Filter;
- Jahrzehnt-, Genre-, Ranking-, Fortschritts- und Running-Gag-Auswertung;
- Losrad nur aus Watchlist-Filmen;
- öffentliche Supabase-Abfragen mit expliziten Veröffentlichungs- und Relationsfiltern;
- externe Scores nur mit Quelle und Abrufdatum;
- neutrale Konfigurations-, Request- und Datenvertragsfehler;
- Admin-Session, serverseitige Userprüfung und Allowlist-RPC;
- gesperrte Adminansichten vor erfolgreicher Prüfung;
- CSV-Konfliktregeln, Zusatzspaltenverwerfung und feste Schreibwhitelist;
- CSV-Backupspalten und Schutz vor Tabellenkalkulationsformeln;
- XSS-Maskierung und lokale ARIA-Referenzen;
- genau eine Hauptüberschrift je Route;
- Statistik-Datentabellen und Quellenlinks;
- reduzierte Motion sowie primäre AA-Kontrastpaare;
- CSP, gepinnter ESM-Client und statische Secret-/Quelldatengrenze;
- Rechtebegrenzung der Erstimport-RPC.

### Syntax

Alle `.js`- und `.mjs`-Dateien unter `public/js` und `tools/initial-import` wurden einzeln mit `node --check` geprüft. Ergebnis: keine Syntaxfehler.

### Statische Struktur

- `public/index.html` mit dem Standard-HTML-Parser eingelesen;
- alle CSS-Dateien auf ausgeglichene Blockklammern geprüft;
- GitHub-Actions-Workflow als YAML eingelesen und Jobabhängigkeit geprüft;
- `.env.example`, Workflow und Einstiegspunkt vorhanden;
- keine echte `.env` vorhanden;
- keine CSV-/XLS-/XLSX-Quelldatei unter `public/`;
- keine Server-Credential-Marker unter `public/`;
- keine offenen `TODO`-/`FIXME`-Marker im finalen Anwendungscode.

Zusätzlich lieferte ein lokaler, kurzlebiger statischer HTTP-Server `public/index.html` und `public/js/app.mjs` jeweils mit Status 200 aus. Ein grafischer Browser war in der Testumgebung nicht verfügbar.

### Vorläufige CSV-Baseline erneut verifiziert

Die bereitgestellte CSV wurde erneut ausschließlich über den Importkern analysiert:

| Wert | Ergebnis |
|---|---:|
| Gesamt | 109 |
| Gesehen | 39 |
| Watchlist | 70 |
| Konfliktgruppe 1 | 0 |
| Konfliktgruppe 2 | 0 |
| Fehlender deutscher Titel | 51 |
| Titelfragment | 25 |
| Fehlendes RT Tomatometer | 4 |
| Fehlender RT Audience Score | 2 |
| Fehlender IMDb-Score | 2 |

Die verbindliche XLSX lag nicht vor; deshalb ist diese Baseline keine Importfreigabe für eine abweichende XLSX.

## Erst im eigenen Projekt ausführbar

Folgende Prüfungen benötigen die Infrastruktur des Besitzers und wurden nicht simuliert oder behauptet:

- Ausführung der sieben Migrationen in Supabase;
- pgTAP-RLS-Test gegen echte Rollen und Storage-Metadaten;
- Import-RPC-Test in Postgres;
- XLSX-Dry-Run mit Deno und dem Tabellenblatt `Films`;
- echter E-Mail-/Passwort-Login;
- Admin-CRUD, Storage-Upload und RLS-Negativtest gegen das eigene Projekt;
- GitHub-Actions-Lauf und Pages-Deployment;
- manuelle Browsermatrix Chrome, Firefox, Safari und Edge;
- manueller Screenreader-, 200-%-Zoom- und vollständiger WCAG-2.2-AA-Audit.

Die Anwendung ist auf WCAG 2.2 AA ausgelegt und automatisiert vorgeprüft. Eine Konformitätsaussage für den Live-Betrieb erfordert zusätzlich die beschriebenen manuellen Tests, insbesondere nach dem Einpflegen echter Inhalte und Poster.
