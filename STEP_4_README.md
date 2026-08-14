<!-- STEP_4_README.md -->
# CageDB – Schritt 4: UI-Basis und Styles

> Historischer Zwischenstand. Die hier beschriebenen Platzhaltergrenzen wurden im finalen Projekt aufgehoben; maßgeblich ist `README.md`.

Dieser Projektstand ersetzt die technische Bereitschaftsseite durch eine mobile-first App-Shell mit CageDB-Designsystem, Hash-Routing, Theme-Steuerung, Web-Animations-Übergang und einem kleinen unveränderlichen Pub/Sub-Store. Es wurden weiterhin weder Daten importiert noch Supabase-Ressourcen oder Deployments angelegt.

## Routen

| Hash | Ansicht | Navigationsbereich |
|---|---|---|
| `#/` | Startseite / Film des Tages | Start |
| `#/filme` | Filmarchiv | Archiv |
| `#/film/:id` | Filmdetail | Archiv |
| `#/statistik` | Statistik | Statistik |
| `#/bio` | Biografie | Bio |
| `#/wall-of-fame` | Wall of Fame | Spielerisch |
| `#/losrad` | Losrad | Spielerisch |
| `#/cage-universe` | Netzwerk-/Listenansicht | Spielerisch |
| `#/admin…` | Verriegelter Adminzugang | Privat |

Unbekannte Hash-Pfade erhalten eine eigene 404-Ansicht. Pfadparameter werden erst nach dem Routenabgleich dekodiert und vor der HTML-Ausgabe maskiert.

## Modulaufteilung

- `public/js/core/router.mjs`: Parser, Musterabgleich und Hash-Navigation
- `public/js/core/state.mjs`: unveränderlicher Store mit synchronem Pub/Sub
- `public/js/core/theme.mjs`: System/Hell/Dunkel und lokale Gerätepräferenz
- `public/js/core/motion.mjs`: reduzierbare WAAPI-Routenbewegung
- `public/js/app-state.mjs`: einzige geteilte State-Instanz
- `public/js/routes.mjs`: zentrale Routenmetadaten
- `public/js/views.mjs`: semantische, datenfreie Grundansichten
- `public/js/app.mjs`: DOM-Bindung und Modulkoordination

Es existieren keine beschreibbaren globalen Variablen. Künftige Schritt-5-Module importieren `appStore` und veröffentlichen nachvollziehbare Zustandsübergänge über `setState`.

## Designsystem

`public/css/tokens.css` definiert Farbrollen, Typografie, Abstände, asymmetrische Radien, Schatten, Fokusfarbe, Motion-Tokens und Genre-Akzente. Filme ohne Genre verwenden `--genre-none`. Dunkel ist die visuelle Grundrichtung; bei Präferenz `system` wird die Betriebssystemeinstellung respektiert. Die manuelle Auswahl wird nur lokal im Browser gespeichert.

Die Gestaltung verwendet keine externen Fonts, Poster oder erfundenen Filmdaten. Poster-, Statistik- und Netzwerkflächen sind bewusst gekennzeichnete, abstrakte Leerzustände.

## Barrierefreiheit

- Semantische Landmarken, Überschriftenreihenfolge und Skip-Link
- Tastaturbedienbares Menü und Theme-Steuerung
- Sichtbarer `:focus-visible`-Zustand
- Fokusmanagement und Live-Ansage nach Routenwechseln
- `prefers-reduced-motion` für CSS und Web Animations API
- Texttabelle als vorgesehene Alternative zu Statistikdiagrammen
- Netzwerkansicht erhält eine gleichwertige Listenansicht
- Admin-Routen rendern vor der Auth-Implementierung keine Formulare oder Pflegefunktionen
- Status wird nicht allein über Farbe vermittelt

## Lokal prüfen

```bash
# STEP_4_README.md — statische Vorschau
python3 -m http.server 8080 --directory public
```

Danach `http://localhost:8080/#/` öffnen. Ein Reload auf einer Hash-Route bleibt auf derselben Ansicht, weil der Hash nicht an GitHub Pages gesendet wird.

```bash
# STEP_4_README.md — Unit-Tests
node --test tests/ui-foundation.test.mjs tools/initial-import/import-core.test.mjs
```

## Bewusste Schritt-4-Grenzen

- Keine Supabase-Abfragen und keine echten Filmwerte
- Keine Admin-Anmeldung oder CRUD-Oberfläche
- Keine aktive Suche, Filter, Charts, Losrad-Logik oder Posterabfrage
- Keine redaktionellen Fakten oder Zitate ohne Quelle

Diese Funktionen werden in Schritt 5 modulweise ergänzt. Bis dahin bleiben Controls mit Datenabhängigkeit deaktiviert oder als eindeutige Leerzustände markiert.
