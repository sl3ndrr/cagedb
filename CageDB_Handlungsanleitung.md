# CageDB – detaillierte Inbetriebnahme und Übergabe

Stand: 14. August 2026  
Projektstatus: Implementierung abgeschlossen; Live-Infrastruktur und redaktionelle Freigabe stehen unter deiner Kontrolle.

## 1. Was bereits erledigt ist

Das Projekt enthält die vollständige öffentliche Anwendung, die private Adminoberfläche, alle Datenbankmigrationen, RLS- und Importtests, den lokalen XLSX-/CSV-Erstimport, den CSV-Korrekturimport im Adminbereich, den GitHub-Pages-Workflow und automatisierte Frontendtests.

Nicht durch mich ausgeführt wurden:

- kein Supabase-Projekt angelegt oder verändert;
- keine Migration in einer echten Datenbank ausgeführt;
- kein Auth-Benutzer oder Admin angelegt;
- keine Importquelle live geschrieben;
- keine Project URL und kein Key in `config.js` eingetragen;
- kein GitHub-Repository erstellt und kein Deployment gestartet;
- keine redaktionellen Genres, Poster, Quellen oder Veröffentlichungen erfunden.

Diese Grenzen sind beabsichtigt: Nur du sollst Zugriff auf Konto, Secret Key, Quelldatei und Veröffentlichungsentscheidung besitzen.

## 2. Was du jetzt benötigst

1. Das finale Projektpaket.
2. Node.js 22 oder neuer für lokale Tests.
3. Deno 2 für den Erstimport.
4. Ein eigenes Supabase-Projekt.
5. Ein privates oder öffentliches GitHub-Repository für GitHub Pages.
6. Die verbindliche Original-XLSX mit dem Tabellenblatt `Films`.

Derzeit ist nur die CSV-Fassung verfügbar. Sie wurde als vorläufige Baseline geprüft:

| Prüfwert | CSV-Ergebnis |
|---|---:|
| Filme | 109 |
| Persönlich bewertet / gesehen | 39 |
| Watchlist | 70 |
| Konflikte „Bewertung sticht Quellstatus“ | 0 |
| Konflikte „Quellstatus gesehen, Bewertung leer“ | 0 |
| Fehlender deutscher Titel | 51 |
| Deutscher Titel als führendes Bindestrichfragment | 25 |
| Fehlendes RT Tomatometer | 4 |
| Fehlender RT Audience Score | 2 |
| Fehlender IMDb-Score | 2 |
| Genres in der Quelle | 0 |
| Poster in der Quelle | 0 |

Die XLSX hat Vorrang. Weicht sie ab, musst du die XLSX-Vorschau prüfen; die CSV-Zahlen dürfen dann nicht als Freigabegrundlage dienen.

## 3. Empfohlene Reihenfolge

1. Projekt lokal prüfen.
2. XLSX bereitstellen und Dry-Run kontrollieren.
3. Supabase-Projekt anlegen.
4. Migrationen und Datenbanktests ausführen.
5. genau einen Auth-Benutzer anlegen und als Admin freischalten.
6. öffentliche Frontend-Konfiguration setzen.
7. Anwendung lokal gegen Supabase testen.
8. Erstimport kontrolliert ausführen.
9. Daten im Adminbereich redaktionell ergänzen und gezielt veröffentlichen.
10. CSV-Backup erstellen.
11. GitHub Pages aktivieren und Browser-/Accessibility-Smoke-Test durchführen.

Gehe nicht zum nächsten Abschnitt, wenn ein ausdrücklich genannter Stopppunkt eintritt.

## 4. Projekt lokal prüfen

### 4.1 Entpacken

Entpacke das ZIP in einen neuen Ordner, zum Beispiel `CageDB`. Importquellen gehören nicht in diesen Ordner.

Prüfe, dass mindestens diese Pfade vorhanden sind:

```text
public/index.html
public/js/app.mjs
public/js/services/admin-api.mjs
supabase/migrations/
supabase/tests/
tools/initial-import/
.github/workflows/deploy-pages.yml
```

### 4.2 Automatisierte Tests

Öffne ein Terminal im Projektordner:

```bash
node --version
node --test tests/*.test.mjs tools/initial-import/import-core.test.mjs
```

Erwartung: alle Tests sind grün, keine übersprungenen oder fehlgeschlagenen Tests.

Danach Syntax aller ausgelieferten Module prüfen:

```bash
find public/js tools/initial-import -type f \( -name '*.js' -o -name '*.mjs' \) \
  -exec node --check {} \;
```

Unter PowerShell kannst du stattdessen ausführen:

```powershell
Get-ChildItem public/js,tools/initial-import -Recurse -Include *.js,*.mjs |
  ForEach-Object { node --check $_.FullName }
```

**Stopppunkt:** Bei einem Fehler nicht deployen und nichts importieren. Sichere die vollständige Fehlermeldung und deine Node-Version; teile niemals Schlüssel oder Passwörter.

### 4.3 Statische Vorschau

```bash
python3 -m http.server 8080 --directory public
```

Öffne `http://localhost:8080/#/`. Mit den unveränderten Platzhaltern muss die Anwendung einen verständlichen Konfigurationszustand anzeigen. Verwende nicht `file://`.

Prüfe vorläufig:

- Menü und Hash-Routen funktionieren;
- Hell, Dunkel und System lassen sich umschalten;
- Fokus ist sichtbar;
- `#/admin` zeigt noch keine Pflegefunktionen;
- reduzierte Bewegung wird respektiert.

## 5. Verbindliche XLSX prüfen

1. Lege `Cage_Code_Importbereit.xlsx` außerhalb des Repositorys ab.
2. Prüfe, dass das Tabellenblatt exakt `Films` heißt.
3. Verändere die Quelldatei nicht, um einen Dry-Run „passend“ zu machen.
4. Installiere Deno 2 und prüfe:

```bash
deno --version
```

5. Starte den Dry-Run ohne Netzwerk- und Umgebungsrechte:

```bash
deno run --no-prompt \
  --allow-read=/ABSOLUTER/PFAD/ZUM/DATENORDNER \
  --allow-import=esm.sh \
  tools/initial-import/import-films.mjs \
  --input /ABSOLUTER/PFAD/ZUM/DATENORDNER/Cage_Code_Importbereit.xlsx
```

Der Dry-Run darf keinen Secret Key benötigen und nichts schreiben.

Kontrolliere in der Vorschau:

- erkannte Datei ist XLSX, nicht eine danebenliegende CSV;
- Tabellenblatt `Films` wurde verwendet;
- erwartete Zeilenzahl;
- Anzahl gesehen und Watchlist;
- beide Konfliktgruppen;
- fehlende Titel und Scores;
- Zahl verworfener Zusatzspalten;
- IMDb-Werte liegen zwischen 0 und 10 mit höchstens einer Nachkommastelle.

Unbekannte Zusatzspalten werden nur gezählt; ihre Namen und Werte erscheinen nicht.

**Stopppunkt:** Bei abweichender Zeilenzahl, Konflikten oder ungültigen Skalen noch keinen Commit ausführen. Prüfe die betreffenden Quellzeilen manuell. `--accept-conflicts` ist keine pauschale Fehlerumgehung.

## 6. Supabase-Projekt anlegen

Diese Schritte führst du im eigenen Supabase-Konto aus:

1. Neues Projekt in einer passenden Region anlegen.
2. Starkes Datenbankpasswort in einem Passwortmanager speichern.
3. Project URL notieren.
4. Publishable Key für den Browser notieren.
5. Separaten Secret Key ausschließlich für den lokalen Erstimport bereithalten.

Der Publishable Key ist öffentlich. Der Secret Key umgeht RLS und ist hochsensibel.

**Niemals teilen oder einchecken:**

- Secret Key;
- Legacy-Service-Role-Key;
- Datenbankpasswort;
- Connection String;
- echte `.env`;
- Screenshots, auf denen diese Werte sichtbar sind.

## 7. Migrationen ausführen

Öffne den Supabase SQL Editor. Führe jede Datei vollständig und einzeln in genau dieser Reihenfolge aus:

| Nr. | Datei |
|---:|---|
| 1 | `supabase/migrations/20260814000100_foundation_and_admin.sql` |
| 2 | `supabase/migrations/20260814000200_catalog_schema.sql` |
| 3 | `supabase/migrations/20260814000300_editorial_schema.sql` |
| 4 | `supabase/migrations/20260814000400_triggers.sql` |
| 5 | `supabase/migrations/20260814000500_grants_and_rls.sql` |
| 6 | `supabase/migrations/20260814000600_poster_storage.sql` |
| 7 | `supabase/migrations/20260814000700_initial_import_rpc.sql` |

Die Migrationen sind wiederholbar. Führe dennoch keine herauskopierten Teilstücke aus und ändere Policies nicht parallel per Dashboard.

**Stopppunkt:** Bei einem SQL-Fehler keine spätere Migration ausführen. Notiere Migration, SQLSTATE und Meldung, ohne geheime Verbindungsdaten.

## 8. RLS und Import-RPC nachweisen

Führe im SQL Editor nacheinander die vollständigen Dateien aus:

1. `supabase/tests/rls_policies.test.sql`
2. `supabase/tests/initial_import_rpc.test.sql`

Erwartung:

- ausschließlich erfolgreiche pgTAP-Zeilen;
- abschließender Rollback;
- anonyme Nutzer lesen nur veröffentlichte Zeilen und können nie schreiben;
- authentifizierte Nicht-Admins können nie schreiben;
- der Admin kann CRUD ausführen;
- unquellierte externe Alt-Scores bleiben öffentlich unsichtbar;
- Poster können nur vom Admin verwaltet werden;
- die Erstimport-RPC ist nur für die vertrauenswürdige Serverrolle ausführbar.

**Stopppunkt:** Bei `not ok`, `FAILED` oder SQL-Fehler keinen Admin freischalten und nichts importieren.

## 9. Genau einen Admin anlegen

1. In Supabase **Authentication → Users** genau einen E-Mail-/Passwort-Benutzer anlegen.
2. Ein langes, einzigartiges Passwort im Passwortmanager verwenden.
3. E-Mail bestätigen.
4. Die Benutzer-UUID kopieren.
5. Lokal `supabase/bootstrap/grant_initial_admin.sql` öffnen.
6. Nur den UUID-Platzhalter ersetzen:

```sql
target_user_id uuid := '00000000-0000-0000-0000-000000000000';
```

7. Die vollständige Bootstrap-Datei im SQL Editor ausführen.
8. Erwartung: genau eine Ergebniszeile mit der UUID, der korrekten E-Mail und `email_confirmed = true`.

Zusatzprüfung:

```sql
select
  admin_user.singleton,
  admin_user.user_id,
  auth_user.email,
  auth_user.email_confirmed_at is not null as email_confirmed
from private.admin_users as admin_user
join auth.users as auth_user on auth_user.id = admin_user.user_id;
```

Erwartung: exakt eine Zeile und `singleton = true`.

Anschließend in der Auth-Konfiguration:

- öffentliche Registrierung deaktivieren;
- anonyme Anmeldung deaktivieren;
- E-Mail/Passwort für den bestehenden Admin aktiviert lassen.

Adminrechte dürfen nicht in User-Metadaten, `localStorage` oder einem Frontendfeld nachgebildet werden.

## 10. Frontend konfigurieren

Bearbeite ausschließlich `public/js/config.js`:

```js
export const APP_CONFIG = Object.freeze({
  appName: "CageDB",
  timezone: "Europe/Berlin",
  posterBucket: "film-posters",
  supabaseUrl: "https://DEIN_PROJECT_REF.supabase.co",
  supabaseAnonKey: "DEIN_PUBLISHABLE_KEY",
});
```

Der Property-Name `supabaseAnonKey` bleibt für Client-Kompatibilität bestehen; der Wert kann der aktuelle Publishable Key sein.

Setze in Supabase Auth unter URL Configuration:

- lokal erlaubte URL: `http://localhost:8080/`;
- später Site URL: `https://DEINNAME.github.io/DEIN_REPOSITORY/`.

Starte den lokalen Server neu und öffne `http://localhost:8080/#/`.

## 11. Admin-Live-Test vor dem Import

1. Öffne ein privates Browserfenster und `#/admin`.
2. Erwartung ohne Login: keine Formulare oder Datensätze.
3. Melde dich mit dem Admin an.
4. Erwartung: Dashboard und Adminnavigation erscheinen.
5. Melde dich ab.
6. Erwartung: Inhalte verschwinden, erneuter Direktaufruf zeigt die Anmeldung.

Optionaler Negativtest: Lege kurzfristig einen zweiten bestätigten Testbenutzer an, ohne ihn in die Allowlist aufzunehmen. Dieser Benutzer muss nach Login „Kein Adminzugriff“ sehen und jede direkte Schreibabfrage muss an RLS scheitern. Lösche den Testbenutzer danach. Die Single-Admin-Allowlist bleibt unverändert.

## 12. Erstimport committen

### 12.1 Secret nur temporär setzen

macOS/Linux:

```bash
export SUPABASE_URL='https://DEIN_PROJECT_REF.supabase.co'
read -rsp 'Supabase Secret Key: ' SUPABASE_SECRET_KEY
export SUPABASE_SECRET_KEY
printf '\n'
```

PowerShell 7.1 oder neuer:

```powershell
$env:SUPABASE_URL = 'https://DEIN_PROJECT_REF.supabase.co'
$env:SUPABASE_SECRET_KEY = Read-Host 'Supabase Secret Key' -MaskInput
```

Gib den Key nie als CLI-Argument ein, weil er sonst in der Shell-Historie stehen kann.

### 12.2 Commit

Nur nach freigegebenem Dry-Run:

```bash
deno run --no-prompt \
  --allow-read=/ABSOLUTER/PFAD/ZUM/DATENORDNER \
  --allow-env=SUPABASE_URL,SUPABASE_SECRET_KEY,SUPABASE_SERVICE_ROLE_KEY \
  --allow-import=esm.sh \
  --allow-net=DEIN_PROJECT_REF.supabase.co \
  tools/initial-import/import-films.mjs \
  --input /ABSOLUTER/PFAD/ZUM/DATENORDNER/Cage_Code_Importbereit.xlsx \
  --commit
```

Wenn die geprüfte Vorschau Konflikte enthält, muss zusätzlich bewusst `--accept-conflicts` gesetzt werden. Die Auflösung bleibt fest: Bewertung vorhanden bedeutet gesehen; ohne Bewertung bleibt der Film Watchlist.

Erwartung beim regulären ersten Lauf:

- empfangene Filme entsprechen der freigegebenen XLSX-Zahl;
- neue Filme wurden eingefügt;
- `published_by_import = 0`;
- ein Wiederholungslauf erzeugt keine Duplikate.

### 12.3 Secret entfernen

macOS/Linux:

```bash
unset SUPABASE_SECRET_KEY SUPABASE_SERVICE_ROLE_KEY SUPABASE_URL
```

PowerShell:

```powershell
Remove-Item Env:SUPABASE_SECRET_KEY -ErrorAction SilentlyContinue
Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
Remove-Item Env:SUPABASE_URL -ErrorAction SilentlyContinue
```

Schließe das Terminal. Rotiere oder lösche einen nur für den Import erzeugten Secret Key anschließend.

## 13. Import prüfen

Im SQL Editor:

```sql
select
  count(*) as total,
  count(*) filter (where my_rating_percent is not null) as gesehen,
  count(*) filter (where my_rating_percent is null) as watchlist,
  count(*) filter (where published) as veroeffentlicht
from public.films;
```

Für die vorläufige CSV-Baseline wäre das `109 / 39 / 70 / 0`. Maßgeblich ist die bestätigte XLSX.

Duplikatprüfung:

```sql
select legacy_import_id, count(*)
from public.films
group by legacy_import_id
having count(*) > 1;
```

Erwartung: keine Zeilen.

## 14. Redaktion im Adminbereich

Arbeite zunächst mit Entwürfen:

1. Filme und Titel prüfen.
2. Fehlende deutsche Titel leer lassen, sofern kein belegter Titel vorliegt.
3. Genres manuell anlegen, Akzentfarbe und Veröffentlichungsstatus setzen.
4. Genres Filmen zuordnen; „Ohne Genre“ funktioniert bis dahin vollständig.
5. Allgemeine und Running-Gag-Tags anlegen und zuordnen.
6. persönliche Notizen und 0–5-Cage-o-meter-Werte pflegen.
7. externe Scores prüfen:
   - keine Werte scrapen;
   - Score nur mit legaler HTTPS-Quelle;
   - Abrufdatum setzen;
   - unklare Altwerte löschen oder unverändert unsichtbar lassen.
8. Poster nur bei geklärten Nutzungsrechten hochladen.
9. Bio, Timeline, Fakten und Zitate pflegen; Fakten und Zitate benötigen eine Quelle.
10. kommende Veröffentlichungen und Filmverbindungen nur mit Prüfdatum und Quelle anlegen.
11. Jeden Film bewusst veröffentlichen; der Bestätigungsdialog ist Teil der Freigabe.

Teste nach der ersten Veröffentlichung in einem privaten Browserfenster:

- Film erscheint im Archiv;
- Entwürfe erscheinen nicht;
- Detailseite zeigt nur belegte Scores;
- Filter „Ohne Genre“ funktioniert;
- Poster-Fallback beziehungsweise Poster funktioniert;
- Startseitenzahlen und Tagesauswahl aktualisieren sich.

## 15. CSV-Korrekturen und Backup

Der Admin-Korrekturimport akzeptiert ausschließlich CSV mit den zehn vereinbarten Quellspalten. Er zeigt vor dem Schreiben:

- Zeilenzahl;
- gesehen/Watchlist gemäß Bewertung;
- beide Konfliktgruppen;
- Anzahl verworfener Zusatzspalten;
- Anzahl Zeilen mit externen Alt-Scores.

Er schreibt nur:

- `legacy_import_id`;
- Jahr;
- Originaltitel;
- deutschen Titel;
- persönliche Bewertung.

Quellstatus und externe Alt-Scores werden nicht geschrieben. Bestehende Veröffentlichungs-, Notiz-, Poster- und Relationsfelder bleiben unberührt.

Erstelle nach der redaktionellen Ersteinrichtung über **CSV & Backup** ein Backup. Öffne es testweise in deiner Tabellenkalkulation und speichere eine Kopie außerhalb des Repositorys. Das Backup enthält nur das fest definierte CageDB-Schema.

## 16. GitHub vorbereiten

Im Projektordner:

```bash
git init
git branch -M main
git add .
git status
```

Prüfe vor dem Commit:

- keine XLSX/CSV-Importquelle;
- keine echte `.env`;
- keine Logs;
- kein Secret Key;
- `public/js/config.js` enthält nur Project URL und Publishable Key.

Zusätzliche Suche:

```bash
git grep -n 'YOUR_PROJECT_REF\|YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY' -- public || true
git grep -n 'sb_secret_\|SUPABASE_SECRET_KEY\|SUPABASE_SERVICE_ROLE_KEY' -- public || true
```

Vor einem Deployment dürfen beide Befehle keine Treffer liefern.

Danach:

```bash
git commit -m "Initialize production-ready CageDB"
git remote add origin DEINE_GITHUB_REPOSITORY_URL
git push -u origin main
```

## 17. GitHub Pages deployen

1. Repository in GitHub öffnen.
2. **Settings → Pages** öffnen.
3. Unter Build and deployment **GitHub Actions** als Source auswählen.
4. Push auf `main` oder manuellen Workflow starten.
5. In Actions prüfen:
   - Unit tests erfolgreich;
   - Syntaxprüfung erfolgreich;
   - Konfigurations-/Secret-Scan erfolgreich;
   - Pages-Artefakt und Deployment erfolgreich.
6. Ausgegebene URL öffnen.
7. Diese URL in Supabase Auth als Site URL setzen.

Der Workflow deployt ausschließlich `public/` und benötigt keine Supabase-Secrets.

## 18. Finaler Smoke-Test

Teste anonym sowie als Admin:

### Öffentlich

- `#/` inklusive stabiler Tagesauswahl bei Reload;
- `#/filme` mit allen Filtern;
- direkter Detail-Link und Reload;
- Statistikdiagramme und Datentabellen;
- Bio/Timeline mit Tastatur;
- Wall of Fame;
- Losrad per Tastatur;
- Cage Universe;
- defektes oder fehlendes Poster;
- keine Entwürfe in privatem Browserfenster.

### Admin

- falsches Passwort zeigt neutrale Meldung;
- gültiger Adminlogin;
- Film speichern, Bewertung entfernen und wieder setzen;
- Quelle/Abrufdatum für externen Score zwingend;
- Genre und Tag anlegen;
- Priorisierung per Drag-and-drop und per Hoch-/Runter-Taste;
- Poster hochladen und entfernen;
- Veröffentlichung und Löschung bestätigen beziehungsweise abbrechen;
- CSV-Vorschau ohne Schreiben;
- CSV-Backup herunterladen;
- Logout entfernt Pflegeansicht.

### Barrierefreiheit

- komplette Tastaturrunde ohne Maus;
- Fokus immer sichtbar;
- sinnvolle Überschriftenreihenfolge;
- Formularlabels und Fehlermeldungen nachvollziehbar;
- Screenreader liest Ergebniszahlen, Tabellen und Live-Ansagen;
- 200-%-Zoom ohne abgeschnittene Kernfunktion;
- mobile Breite ab 320 px;
- Hell, Dunkel und System;
- Betriebssystemoption „Bewegung reduzieren“.

Teste die letzten zwei Versionen von Chrome, Firefox, Safari und Edge, soweit dir die Plattformen zur Verfügung stehen.

## 19. Betrieb und Wiederherstellung

- Nach größeren redaktionellen Änderungen CSV-Backup exportieren.
- Backups datiert außerhalb des Repositorys speichern.
- Vor Migrationen Supabase-Datenbankbackup beziehungsweise Point-in-Time-Recovery gemäß deinem Tarif prüfen.
- RLS-Änderungen nur als neue Migration und mit pgTAP-Test vornehmen.
- Supabase-Clientversion bewusst aktualisieren und Tests erneut ausführen.
- Keine externen Scores oder Fakten automatisiert übernehmen, solange keine legale, serverseitige Integration mit Provenienz existiert.
- Bei verlorenem Adminpasswort den vertrauenswürdigen Supabase-Dashboard-Prozess verwenden; keine Reset-Tokens in Chat oder Logs kopieren.

## 20. Wann du mich wieder einschalten solltest

Bitte nur nicht-geheime Informationen teilen:

- XLSX-Dry-Run-Zusammenfassung;
- fehlgeschlagene Testnamen und Fehlermeldungen;
- SQLSTATE und Policy-Testausgabe;
- anonymisierte Browser-Konsole;
- konkrete UI-Beobachtung und Browser-Version.

Nie teilen: Passwort, Secret Key, Datenbankverbindung, Sessiontoken oder vollständiger Auth-Header.
