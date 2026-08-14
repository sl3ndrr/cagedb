// public/js/views.mjs
import {
  archiveFiltersFromQuery,
  buildArchiveOptions,
  calculatePublicStatistics,
  filterFilms,
  findFilmById,
} from "./domain/catalog.mjs";
import { CAGE_METRICS } from "./domain/home-catalog.mjs";

const INTEGER = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const DECIMAL = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const DATE = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const ADMIN_ROUTE_IDS = new Set([
  "admin", "admin-login", "admin-films", "admin-genres", "admin-import", "admin-editorial",
]);

export function renderRouteView(route, context = {}) {
  if (ADMIN_ROUTE_IDS.has(route.id)) return renderAdmin(route, context.session);
  switch (route.id) {
    case "home": return renderHome(context.publicCatalog);
    case "films": return renderArchive(route, context.publicCatalog);
    case "film-detail": return renderFilmDetail(route, context.publicCatalog);
    case "stats": return renderStatistics(context.publicCatalog);
    case "bio": return renderBio(context.publicCatalog);
    case "wall": return renderWall(context.publicCatalog);
    case "wheel": return renderWheel(context.publicCatalog, context.wheelFilmId);
    case "universe": return renderUniverse(context.publicCatalog);
    default: return renderNotFound(route.location?.path ?? "/");
  }
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function renderHome(catalog = idleCatalog()) {
  const data = readyData(catalog);
  return `
    <article class="view" data-view="home">
      <section class="hero" aria-labelledby="home-title">
        <div class="hero__copy">
          <p class="eyebrow">Abfrage / Film des Tages</p>
          <h1 class="hero__title" id="home-title">Eine Filmografie. Eine Datenbank. <span class="accent">Maximale Cage-Energie.</span></h1>
          <p class="hero__lede">Entdecke Nicolas-Cage-Filme, verfolge deine Watchlist und werte persönliche Bewertungen aus – technisch präzise und angenehm eigenwillig.</p>
          <div class="action-row"><a class="button" href="#/filme">Filmarchiv öffnen</a><a class="button button--secondary" href="#/losrad">Watchlist auslosen</a></div>
          <ul class="query-meta" aria-label="Datenbankeigenschaften"><li>Persönlicher Index</li><li>Bewertung = gesehen</li><li>Nur veröffentlicht</li></ul>
        </div>
        ${renderDailyFilm(catalog)}
      </section>
      <section aria-labelledby="quick-stats-title">
        <div class="section-heading"><div><p class="code-label">ABFRAGE / GESAMTSTATISTIK</p><h2 id="quick-stats-title">Filmografie auf einen Blick</h2></div><p>${catalogMessage(catalog)}</p></div>
        <div class="stat-grid" ${catalog.status === "loading" ? 'aria-busy="true"' : ""}>
          ${statCard("Gesehen", data ? INTEGER.format(data.stats.seen) : "…", "Persönliche Bewertung vorhanden")}
          ${statCard("Watchlist", data ? INTEGER.format(data.stats.watchlist) : "…", "Persönliche Bewertung fehlt")}
          ${statCard("Ø Bewertung", data?.stats.averageRating == null ? "—" : `${DECIMAL.format(data.stats.averageRating)} %`, "Nur vorhandene Bewertungen")}
          ${cageStatCard(data?.stats.cageOMeter ?? null)}
        </div>
      </section>
      <section aria-labelledby="modules-title"><div class="section-heading"><div><p class="code-label">INDEX / MODULE</p><h2 id="modules-title">Mehr CageDB</h2></div></div><div class="module-grid">
        ${moduleCard("01", "Statistik", "Jahrzehnte, Genres, Rankings und Fortschritt.", "#/statistik")}
        ${moduleCard("02", "Wall of Fame", "Gesehene Filme als Poster-Collage.", "#/wall-of-fame")}
        ${moduleCard("03", "Cage Universe", "Quellenbasierte Verbindungen in einer Liste.", "#/cage-universe")}
        ${moduleCard("04", "Biografie", "Redaktionelle Timeline mit Quellen.", "#/bio")}
      </div></section>
    </article>`;
}

function renderDailyFilm(catalog) {
  if (catalog.status === "error") return dataErrorCard(catalog, "Film des Tages");
  if (!readyData(catalog)) return loadingCard("Film des Tages", "Veröffentlichte Watchlist wird geladen.");
  const film = catalog.data.dailyFilm;
  if (!film) return `<aside class="feature-card" data-genre="none" aria-labelledby="daily-title"><div class="feature-card__header"><span class="code-label">TAGESAUSWAHL</span><span class="status-chip">Keine Auswahl</span></div><div class="feature-card__body">${poster(null, "CageDB")}</div><h2 id="daily-title">${catalog.data.stats.total ? "Watchlist vollständig gesehen" : "Noch keine Filme veröffentlicht"}</h2><p>Eine Auswahl erscheint, sobald ein veröffentlichter Film ohne persönliche Bewertung vorhanden ist.</p></aside>`;
  return `<aside class="feature-card" ${genreStyle(film)} aria-labelledby="daily-title"><div class="feature-card__header"><span class="code-label">TAGESAUSWAHL / ${escapeHtml(catalog.data.dailyDateKey)}</span><span class="status-chip" data-tone="watchlist">Watchlist</span></div><div class="feature-card__body">${poster(film)}<div><p class="feature-card__meta">${escapeHtml(film.releaseYear ?? "Jahr offen")} · ${escapeHtml(genreNames(film))}</p><h2 id="daily-title">${escapeHtml(film.displayTitle)}</h2><p>Deterministisch ausgewählt aus ${INTEGER.format(catalog.data.dailyCandidateCount)} veröffentlichten Watchlist-Filmen.</p><a href="#/film/${encodeURIComponent(film.id)}">Filmdetails öffnen</a></div></div></aside>`;
}

function renderArchive(route, catalog) {
  const shell = publicShell(catalog, "Filmarchiv", "FILTER / PUBLIC_FILMS");
  if (shell) return shell;
  const filters = archiveFiltersFromQuery(route.location?.query);
  const options = buildArchiveOptions(catalog.data.films, catalog.data.genres, catalog.data.tags);
  const films = filterFilms(catalog.data.films, filters);
  return `<article class="view" data-view="archive"><header class="route-head"><p class="eyebrow">FILTER / PUBLIC_FILMS</p><h1>Filmarchiv</h1><p>Suche und kombiniere Jahr, Jahrzehnt, Genre, Status, persönliche Bewertung und Tags.</p></header>
    <form class="filter-shell form-grid" data-archive-filter>
      ${field("Suche", `<input type="search" name="q" value="${escapeHtml(filters.query)}" autocomplete="off">`)}
      ${field("Jahr", select("year", "Alle Jahre", options.years.map((year) => [year, year]), filters.year))}
      ${field("Jahrzehnt", select("decade", "Alle Jahrzehnte", options.decades.map((decade) => [decade, `${decade}er`]), filters.decade))}
      ${field("Genre", select("genre", "Alle Genres", [...(options.hasGenreGap ? [["none", "Ohne Genre"]] : []), ...options.genres.map((genre) => [genre.slug, genre.name])], filters.genre))}
      ${field("Status", select("status", "", [["all", "Alle"], ["seen", "Gesehen"], ["watchlist", "Watchlist"]], filters.status))}
      ${field("Bewertung ab", `<input type="number" name="ratingMin" min="0" max="100" step="1" value="${escapeHtml(filters.ratingMin)}">`)}
      ${field("Bewertung bis", `<input type="number" name="ratingMax" min="0" max="100" step="1" value="${escapeHtml(filters.ratingMax)}">`)}
      ${field("Tag", select("tag", "Alle Tags", options.tags.map((tag) => [tag.slug, tag.name]), filters.tag))}
      <div class="form-actions"><button class="button" type="submit">Filter anwenden</button><a class="button button--secondary" href="#/filme">Zurücksetzen</a></div>
    </form>
    <section aria-labelledby="archive-results"><div class="section-heading"><div><p class="code-label">ERGEBNIS</p><h2 id="archive-results">${INTEGER.format(films.length)} von ${INTEGER.format(catalog.data.films.length)} Filmen</h2></div></div>
      ${films.length ? `<div class="film-grid">${films.map(filmCard).join("")}</div>` : emptyState("0 ROWS", "Keine Treffer", "Passe einen oder mehrere Filter an.")}
    </section></article>`;
}

function renderFilmDetail(route, catalog) {
  const shell = publicShell(catalog, "Filmdetail", "RECORD / FILM");
  if (shell) return shell;
  const film = findFilmById(catalog.data.films, route.params?.id);
  if (!film) return `<article class="view" data-view="film-detail"><header class="route-head"><p class="eyebrow">RECORD / NICHT GEFUNDEN</p><h1>Film nicht gefunden</h1><p>Der Datensatz existiert nicht oder ist nicht veröffentlicht.</p></header><a class="button" href="#/filme">Zum Archiv</a></article>`;
  const rt = film.scores.find((score) => score.provider === "rotten_tomatoes");
  const imdb = film.scores.find((score) => score.provider === "imdb");
  return `<article class="view" data-view="film-detail"><a href="#/filme">← Zurück zum Archiv</a><section class="detail-hero" ${genreStyle(film)}><div>${poster(film)}</div><div><p class="eyebrow">RECORD / ${escapeHtml(film.legacyImportId ?? film.id)}</p><h1>${escapeHtml(film.displayTitle)}</h1><p class="meta-line">${escapeHtml(film.releaseYear ?? "Jahr unbekannt")} · ${escapeHtml(genreNames(film))}</p>${film.germanTitle && film.germanTitle !== film.originalTitle ? `<p>Originaltitel: ${escapeHtml(film.originalTitle)}</p>` : ""}<span class="status-chip" data-tone="${film.watched ? "seen" : "watchlist"}">${film.watched ? `${film.myRatingPercent} % · gesehen` : "Watchlist"}</span></div></section>
    <div class="detail-grid"><section class="panel" aria-labelledby="notes-title"><h2 id="notes-title">Persönliche Notizen</h2><p>${film.notes ? nl2br(film.notes) : "Noch keine Notizen hinterlegt."}</p><h3>Tags</h3>${tagList(film.tags)}</section>
      <section class="panel" aria-labelledby="meter-title"><h2 id="meter-title">Cage-o-meter</h2>${metricList(film.metrics)}</section>
      <section class="panel" aria-labelledby="scores-title"><h2 id="scores-title">Externe Scores</h2>${scoreBlock(rt, imdb)}</section></div></article>`;
}

function renderStatistics(catalog) {
  const shell = publicShell(catalog, "Statistik", "AGGREGATE / PUBLIC_FILMS");
  if (shell) return shell;
  const stats = calculatePublicStatistics(catalog.data.films);
  return `<article class="view" data-view="statistics"><header class="route-head"><p class="eyebrow">AGGREGATE / PUBLIC_FILMS</p><h1>Statistik</h1><p>Alle Werte werden live aus den veröffentlichten CageDB-Datensätzen berechnet.</p></header>
    <section class="panel" aria-labelledby="progress-title"><h2 id="progress-title">Fortschritt</h2><p class="big-number">${DECIMAL.format(stats.progressPercent)} %</p><progress max="${stats.total || 1}" value="${stats.seen}">${stats.progressPercent} %</progress><p>${stats.seen} gesehen · ${stats.watchlist} Watchlist · ${stats.total} gesamt</p></section>
    ${chartSection("decades", "Filme pro Jahrzehnt", stats.decades)}
    ${chartSection("genres", "Genre-Verteilung", stats.genres)}
    <div class="detail-grid">${ranking("Top 10", stats.top)}${ranking("Flop 10", stats.flop)}</div>
    <section class="panel" aria-labelledby="gags-title"><h2 id="gags-title">Running-Gag-Tracker</h2>${stats.runningGags.length ? dataTable(["Tag", "Filme"], stats.runningGags.map((row) => [row.label, row.value])) : `<p>Noch keine veröffentlichten Running-Gag-Tags zugeordnet.</p>`}</section>
  </article>`;
}

function renderBio(catalog) {
  const shell = publicShell(catalog, "Biografie", "EDITORIAL / SOURCED");
  if (shell) return shell;
  const content = catalog.data.editorialContent;
  const biography = content.filter((item) => item.contentType === "biography");
  const timeline = content.filter((item) => item.contentType === "timeline");
  const sourced = content.filter((item) => ["fact", "quote"].includes(item.contentType) && item.sourceLabel);
  return `<article class="view" data-view="bio"><header class="route-head"><p class="eyebrow">EDITORIAL / SOURCED</p><h1>Biografie</h1><p>Diese Seite zeigt ausschließlich veröffentlichte redaktionelle Inhalte. Fakten und Zitate erscheinen nur mit Quellenangabe.</p></header>
    <section class="panel reading" aria-labelledby="bio-copy"><h2 id="bio-copy">Biografie</h2>${biography.length ? biography.map((item) => `<article><h3>${escapeHtml(item.title ?? "Abschnitt")}</h3><p>${nl2br(item.body)}</p>${sourceLink(item)}</article>`).join("") : `<p>Noch kein Biografie-Inhalt veröffentlicht.</p>`}</section>
    <section aria-labelledby="timeline-title"><div class="section-heading"><div><p class="code-label">CHRONOLOGIE</p><h2 id="timeline-title">Interaktive Timeline</h2></div></div>${timeline.length ? `<div class="timeline">${timeline.map((item) => `<details><summary><span>${escapeHtml(item.eventDate ? formatDate(item.eventDate) : item.eventYear ?? "Datum offen")}</span>${escapeHtml(item.title ?? "Ereignis")}</summary><p>${nl2br(item.body)}</p>${sourceLink(item)}</details>`).join("")}</div>` : emptyState("0 EVENTS", "Noch keine Timeline", "Veröffentlichte Timeline-Einträge erscheinen hier.")}</section>
    <section aria-labelledby="facts-title"><div class="section-heading"><div><p class="code-label">QUELLENREGISTER</p><h2 id="facts-title">Fakten & Zitate</h2></div></div>${sourced.length ? `<div class="module-grid">${sourced.map(editorialCard).join("")}</div>` : emptyState("0 SOURCES", "Noch keine Fakten oder Zitate", "Nur Inhalte mit Quellenangabe werden angezeigt.")}</section>
    ${upcomingSection(catalog.data.upcomingReleases)}
  </article>`;
}

function renderWall(catalog) {
  const shell = publicShell(catalog, "Wall of Fame", "POSTERS / SEEN");
  if (shell) return shell;
  const films = catalog.data.films.filter((film) => film.watched)
    .sort((a, b) => b.myRatingPercent - a.myRatingPercent || a.displayTitle.localeCompare(b.displayTitle, "de"));
  return `<article class="view" data-view="wall"><header class="route-head"><p class="eyebrow">POSTERS / SEEN</p><h1>Wall of Fame</h1><p>${films.length} gesehene Filme, nach persönlicher Bewertung sortiert. Fehlende Poster erhalten einen gestalteten Platzhalter.</p></header>${films.length ? `<div class="poster-wall">${films.map((film) => `<a class="wall-tile" href="#/film/${encodeURIComponent(film.id)}" aria-label="${escapeHtml(film.displayTitle)}, ${film.myRatingPercent} Prozent">${poster(film)}<span>${escapeHtml(film.displayTitle)} · ${film.myRatingPercent} %</span></a>`).join("")}</div>` : emptyState("0 SEEN", "Noch keine Wall of Fame", "Bewertete, veröffentlichte Filme erscheinen hier.")}</article>`;
}

function renderWheel(catalog, wheelFilmId) {
  const shell = publicShell(catalog, "Losrad", "RANDOM / WATCHLIST");
  if (shell) return shell;
  const watchlist = catalog.data.films.filter((film) => !film.watched);
  const selected = findFilmById(watchlist, wheelFilmId);
  return `<article class="view" data-view="wheel"><header class="route-head"><p class="eyebrow">RANDOM / WATCHLIST</p><h1>Losrad</h1><p>Ziehe zufällig einen veröffentlichten Watchlist-Film. Die priorisierte Liste bestimmt nur die Anzeige, nicht die Chance.</p></header><section class="wheel-panel" aria-labelledby="wheel-result"><div class="wheel-disc" aria-hidden="true"><span>CAGE</span><span>DB</span></div><div><h2 id="wheel-result">${selected ? escapeHtml(selected.displayTitle) : `${watchlist.length} Filme im Lostopf`}</h2><p>${selected ? `${escapeHtml(selected.releaseYear ?? "Jahr unbekannt")} · ${escapeHtml(genreNames(selected))}` : "Aktiviere das Losrad per Maus oder Tastatur."}</p><button class="button" type="button" data-spin-wheel ${watchlist.length ? "" : "disabled"}>${selected ? "Noch einmal ziehen" : "Film ziehen"}</button>${selected ? `<a class="button button--secondary" href="#/film/${encodeURIComponent(selected.id)}">Details</a>` : ""}</div></section></article>`;
}

function renderUniverse(catalog) {
  const shell = publicShell(catalog, "Cage Cinematic Universe", "GRAPH / SOURCED_LINKS");
  if (shell) return shell;
  const films = new Map(catalog.data.films.map((film) => [film.id, film]));
  const connections = catalog.data.connections.filter((item) => films.has(item.sourceFilmId) && films.has(item.targetFilmId));
  return `<article class="view" data-view="universe"><header class="route-head"><p class="eyebrow">GRAPH / SOURCED_LINKS</p><h1>Cage Cinematic Universe</h1><p>Eine einfache Netzwerk-Liste aus redaktionell gepflegten, veröffentlichten und quellenbasierten Verbindungen.</p></header>${connections.length ? `<ol class="connection-map">${connections.map((item) => { const source = films.get(item.sourceFilmId); const target = films.get(item.targetFilmId); return `<li><div class="connection-node"><a href="#/film/${encodeURIComponent(source.id)}">${escapeHtml(source.displayTitle)}</a><span aria-hidden="true">→</span><a href="#/film/${encodeURIComponent(target.id)}">${escapeHtml(target.displayTitle)}</a></div><p><strong>${escapeHtml(item.connectionType)}</strong>${item.description ? ` · ${escapeHtml(item.description)}` : ""}</p>${sourceLink(item)}</li>`; }).join("")}</ol>` : emptyState("0 EDGES", "Noch keine Verbindungen", "Veröffentlichte Verknüpfungen erscheinen hier als zugängliche Liste.")}</article>`;
}

function renderAdmin(route, session = { status: "unknown" }) {
  if (["unknown", "checking"].includes(session?.status)) return adminGate("Sitzung wird geprüft", "Admininhalte werden erst nach verifizierter Anmeldung geladen.");
  if (session?.status === "anonymous") return renderLogin(session.errorCode, session.notice);
  if (session?.status === "forbidden") return adminGate("Kein Adminzugriff", "Die Anmeldung ist gültig, die User-ID steht jedoch nicht in der serverseitigen Admin-Allowlist.", true);
  if (session?.status === "error") return adminGate("Adminbereich nicht erreichbar", "Die sichere Sitzungs- oder Datenprüfung ist fehlgeschlagen. Bitte erneut versuchen.", true);
  if (session?.status !== "ready" || !session.data) return adminGate("Adminbereich gesperrt", "Es werden keine Bearbeitungsfunktionen angezeigt.");
  const body = route.id === "admin-films" ? adminFilms(route, session.data)
    : route.id === "admin-genres" ? adminLookups(route, session.data)
      : route.id === "admin-import" ? adminImport(session)
        : route.id === "admin-editorial" ? adminEditorial(route, session.data)
          : adminDashboard(session.data);
  return `<article class="view admin-view" data-view="admin-ready"><header class="admin-bar"><div><p class="eyebrow">PRIVATE / VERIFIED_ADMIN</p><h1>${escapeHtml(route.title.replace("Admin · ", ""))}</h1></div><button class="button button--secondary" type="button" data-admin-logout>Abmelden</button></header>${adminNavigation(route.id)}${adminNotice(session)}${body}</article>`;
}

function renderLogin(errorCode, notice = null) {
  const message = notice?.message ?? (errorCode ? "Anmeldung fehlgeschlagen. Prüfe E-Mail, Passwort und Adminfreigabe." : null);
  return `<article class="view" data-view="admin-login"><header class="route-head"><p class="eyebrow">AUTH / EMAIL_PASSWORD</p><h1>Admin-Anmeldung</h1><p>Bearbeitungsfunktionen werden nur nach Authentifizierung und serverseitiger Allowlist-Prüfung geladen.</p></header><form class="panel form-stack auth-form" data-admin-login><h2>Anmelden</h2>${message ? `<p class="notice" data-tone="danger">${escapeHtml(message)}</p>` : ""}${field("E-Mail", `<input type="email" name="email" autocomplete="username" required>`)}${field("Passwort", `<input type="password" name="password" autocomplete="current-password" required>`)}<button class="button" type="submit">Sicher anmelden</button></form></article>`;
}

function adminDashboard(data) {
  const seen = data.films.filter((film) => film.my_rating_percent !== null).length;
  const published = data.films.filter((film) => film.published).length;
  return `<section aria-labelledby="dashboard-title"><h2 id="dashboard-title">Dashboard</h2><div class="stat-grid">${statCard("Filme", data.films.length, `${published} veröffentlicht`)}${statCard("Gesehen", seen, `${data.films.length - seen} Watchlist`)}${statCard("Genres", data.genres.length, "Frei erweiterbare Lookup-Werte")}${statCard("Redaktion", data.editorial.length, "Bio, Timeline, Fakten und Zitate")}</div></section>`;
}

function adminFilms(route, data) {
  const editId = firstQuery(route, "edit");
  const film = data.films.find((item) => item.id === editId) ?? null;
  const metric = data.metrics.find((item) => item.film_id === film?.id) ?? {};
  const filmGenreIds = new Set(data.filmGenres.filter((item) => item.film_id === film?.id).map((item) => item.genre_id));
  const filmTagIds = new Set(data.filmTags.filter((item) => item.film_id === film?.id).map((item) => item.tag_id));
  const rt = data.scores.find((item) => item.film_id === film?.id && item.provider === "rotten_tomatoes") ?? {};
  const imdb = data.scores.find((item) => item.film_id === film?.id && item.provider === "imdb") ?? {};
  const watchlist = [...data.films].filter((item) => item.my_rating_percent === null).sort((a, b) => (a.watchlist_priority ?? 999999) - (b.watchlist_priority ?? 999999) || a.display_title.localeCompare(b.display_title, "de"));
  return `<section class="admin-split"><div><div class="section-heading"><div><p class="code-label">CRUD / FILMS</p><h2>${film ? "Film bearbeiten" : "Film anlegen"}</h2></div>${film ? `<a href="#/admin/filme">Neuer Film</a>` : ""}</div>
    <form class="panel form-stack" data-film-form data-was-published="${film?.published ?? false}"><input type="hidden" name="id" value="${escapeHtml(film?.id ?? "")}">
      <div class="form-grid">${field("Import-ID", `<input name="legacy_import_id" value="${escapeHtml(film?.legacy_import_id ?? "")}">`)}${field("Jahr", `<input type="number" name="release_year" min="1888" max="2200" value="${escapeHtml(film?.release_year ?? "")}">`)}${field("Originaltitel", `<input name="original_title" required value="${escapeHtml(film?.original_title ?? "")}">`)}${field("Deutscher Titel", `<input name="german_title" value="${escapeHtml(film?.german_title ?? "")}">`)}${field("Meine Bewertung (0–100)", `<input type="number" name="my_rating_percent" min="0" max="100" step="1" value="${escapeHtml(film?.my_rating_percent ?? "")}">`)}${field("Watchlist-Priorität", `<input type="number" name="watchlist_priority" min="1" step="1" value="${escapeHtml(film?.watchlist_priority ?? "")}" ${film?.my_rating_percent != null ? "disabled" : ""}>`)}</div>
      ${field("Notizen", `<textarea name="notes" rows="5">${escapeHtml(film?.notes ?? "")}</textarea>`)}
      <fieldset><legend>Genres</legend><div class="check-grid">${data.genres.map((item) => checkbox("genre_ids", item.id, item.name, filmGenreIds.has(item.id))).join("") || "<p>Noch keine Genres.</p>"}</div></fieldset>
      <fieldset><legend>Tags</legend><div class="check-grid">${data.tags.map((item) => checkbox("tag_ids", item.id, `${item.name} · ${item.kind === "running_gag" ? "Running Gag" : "Allgemein"}`, filmTagIds.has(item.id))).join("") || "<p>Noch keine Tags.</p>"}</div></fieldset>
      <fieldset><legend>Cage-o-meter (0–5, leer = nicht bewertet)</legend><div class="form-grid">${metricInput("Perücke", "wig", metric.wig)}${metricInput("Schrei-Intensität", "scream_intensity", metric.scream_intensity)}${metricInput("Explosionen", "explosions", metric.explosions)}${metricInput("Overacting-Level", "overacting_level", metric.overacting_level)}</div></fieldset>
      ${scoreFields("Rotten Tomatoes", "rt", rt, true)}${scoreFields("IMDb", "imdb", imdb, false)}
      <label class="check-row"><input type="checkbox" name="published" ${checked(film?.published)}> Veröffentlicht</label><p class="help-text">Veröffentlichen erfordert beim Speichern eine zusätzliche Bestätigung.</p>
      <div class="form-actions"><button class="button" type="submit">Film speichern</button>${film ? `<button class="button button--danger" type="button" data-delete-film="${film.id}" data-label="${escapeHtml(film.display_title)}">Film löschen</button>` : ""}</div>
    </form>
    ${film ? posterAdminForm(film) : ""}</div>
    <div><section class="panel"><div class="section-heading"><div><p class="code-label">RECORDS</p><h2>Alle Filme</h2></div><span>${data.films.length}</span></div><div class="admin-record-list">${data.films.map((item) => `<a href="#/admin/filme?edit=${encodeURIComponent(item.id)}"><span>${escapeHtml(item.display_title)}</span><small>${escapeHtml(item.release_year ?? "—")} · ${item.published ? "Live" : "Entwurf"}</small></a>`).join("")}</div></section>
      <section class="panel"><h2>Watchlist priorisieren</h2><p class="help-text">Ziehe Einträge oder nutze die beschrifteten Hoch-/Runter-Schaltflächen. Änderungen werden sofort gespeichert.</p><ol class="priority-list" data-priority-list>${watchlist.map((item, index) => `<li draggable="true" data-film-id="${item.id}"><span class="drag-handle" aria-hidden="true">⋮⋮</span><span>${escapeHtml(item.display_title)}</span><div><button type="button" data-priority-move="up" aria-label="${escapeHtml(item.display_title)} nach oben" ${index === 0 ? "disabled" : ""}>↑</button><button type="button" data-priority-move="down" aria-label="${escapeHtml(item.display_title)} nach unten" ${index === watchlist.length - 1 ? "disabled" : ""}>↓</button></div></li>`).join("")}</ol></section></div></section>`;
}

function adminLookups(route, data) {
  const genre = data.genres.find((item) => item.id === firstQuery(route, "genreEdit")) ?? null;
  const tag = data.tags.find((item) => item.id === firstQuery(route, "tagEdit")) ?? null;
  return `<div class="detail-grid"><section><h2>Genres</h2><form class="panel form-stack" data-lookup-form="genres"><input type="hidden" name="id" value="${escapeHtml(genre?.id ?? "")}">${field("Name", `<input name="name" required value="${escapeHtml(genre?.name ?? "")}">`)}${field("Slug", `<input name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" required value="${escapeHtml(genre?.slug ?? "")}">`)}${field("Akzentfarbe", `<input type="color" name="accent_color" value="${escapeHtml(genre?.accent_color ?? "#929ca4")}">`)}<label class="check-row"><input type="checkbox" name="published" ${checked(genre?.published)}> Veröffentlicht</label><button class="button" type="submit">Genre speichern</button></form>${lookupList(data.genres, "genreEdit", "genres")}</section>
    <section><h2>Tags</h2><form class="panel form-stack" data-lookup-form="tags"><input type="hidden" name="id" value="${escapeHtml(tag?.id ?? "")}">${field("Name", `<input name="name" required value="${escapeHtml(tag?.name ?? "")}">`)}${field("Slug", `<input name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" required value="${escapeHtml(tag?.slug ?? "")}">`)}${field("Typ", select("kind", "", [["general", "Allgemein"], ["running_gag", "Running Gag"]], tag?.kind ?? "general"))}<label class="check-row"><input type="checkbox" name="published" ${checked(tag?.published)}> Veröffentlicht</label><button class="button" type="submit">Tag speichern</button></form>${lookupList(data.tags, "tagEdit", "tags")}</section></div>`;
}

function adminImport(session) {
  const preview = session.csvPreview;
  return `<section class="admin-split"><div><h2>CSV-Korrekturimport</h2><form class="panel form-stack" data-csv-preview><p>Nur CSV mit den zehn vereinbarten Quellspalten. Zusatzspalten werden verworfen; Namen und Werte werden nicht angezeigt.</p>${field("CSV-Datei", `<input type="file" name="csv" accept=".csv,text/csv" required>`)}<button class="button" type="submit">Vorschau erstellen</button></form>${preview ? csvPreview(preview) : ""}</div><div><h2>Backup</h2><section class="panel"><p>Exportiert ausschließlich das definierte CageDB-Schema inklusive Genres, Tags, Metriken und belegten Scorequellen.</p><button class="button" type="button" data-csv-export>CSV-Backup herunterladen</button></section><section class="panel"><h3>Wichtige Grenze</h3><p>RT- und IMDb-Werte der Korrekturdatei werden nur gezählt, aber ohne manuell gepflegte HTTPS-Quelle und Abrufdatum nicht übernommen.</p></section></div></section>`;
}

function adminEditorial(route, data) {
  const content = data.editorial.find((item) => item.id === firstQuery(route, "contentEdit")) ?? null;
  const upcoming = data.upcoming.find((item) => item.id === firstQuery(route, "upcomingEdit")) ?? null;
  const connection = data.connections.find((item) => item.id === firstQuery(route, "connectionEdit")) ?? null;
  const filmOptions = data.films.map((film) => [film.id, film.display_title]);
  return `<div class="editorial-admin"><section><h2>Bio, Timeline, Fakten & Zitate</h2><form class="panel form-stack" data-editorial-form><input type="hidden" name="id" value="${escapeHtml(content?.id ?? "")}">${field("Typ", select("content_type", "", [["biography", "Biografie"], ["timeline", "Timeline"], ["fact", "Fakt"], ["quote", "Zitat"]], content?.content_type ?? "biography"))}${field("Titel", `<input name="title" value="${escapeHtml(content?.title ?? "")}">`)}${field("Text", `<textarea name="body" rows="5" required>${escapeHtml(content?.body ?? "")}</textarea>`)}${field("Zitat-Zuschreibung", `<input name="quote_attribution" value="${escapeHtml(content?.quote_attribution ?? "")}">`)}<div class="form-grid">${field("Ereignisdatum", `<input type="date" name="event_date" value="${escapeHtml(content?.event_date ?? "")}">`)}${field("Ereignisjahr", `<input type="number" name="event_year" min="1800" max="2200" value="${escapeHtml(content?.event_year ?? "")}">`)}${field("Sortierung", `<input type="number" name="sort_order" value="${escapeHtml(content?.sort_order ?? 0)}">`)}</div>${sourceInputs(content)}<label class="check-row"><input type="checkbox" name="published" ${checked(content?.published)}> Veröffentlicht</label><button class="button" type="submit">Inhalt speichern</button></form>${genericList(data.editorial, "contentEdit", "editorial_content", (item) => item.title ?? item.content_type)}</section>
    <section><h2>Kommende Veröffentlichungen</h2><form class="panel form-stack" data-upcoming-form><input type="hidden" name="id" value="${escapeHtml(upcoming?.id ?? "")}">${field("Originaltitel", `<input name="original_title" required value="${escapeHtml(upcoming?.original_title ?? "")}">`)}${field("Deutscher Titel", `<input name="german_title" value="${escapeHtml(upcoming?.german_title ?? "")}">`)}${field("Rolle", `<input name="role_name" value="${escapeHtml(upcoming?.role_name ?? "")}">`)}<div class="form-grid">${field("Erwartetes Datum", `<input type="date" name="expected_release_date" value="${escapeHtml(upcoming?.expected_release_date ?? "")}">`)}${field("Zeitfenster", `<input name="expected_release_window" value="${escapeHtml(upcoming?.expected_release_window ?? "")}">`)}${field("Status", `<input name="status_label" value="${escapeHtml(upcoming?.status_label ?? "")}">`)}</div>${field("Notizen", `<textarea name="notes">${escapeHtml(upcoming?.notes ?? "")}</textarea>`)}${sourceInputs(upcoming, true)}<label class="check-row"><input type="checkbox" name="published" ${checked(upcoming?.published)}> Veröffentlicht</label><button class="button" type="submit">Veröffentlichung speichern</button></form>${genericList(data.upcoming, "upcomingEdit", "upcoming_releases", (item) => item.display_title)}</section>
    <section><h2>Cage Universe</h2><form class="panel form-stack" data-connection-form><input type="hidden" name="id" value="${escapeHtml(connection?.id ?? "")}">${field("Ausgangsfilm", select("source_film_id", "Film wählen", filmOptions, connection?.source_film_id))}${field("Zielfilm", select("target_film_id", "Film wählen", filmOptions, connection?.target_film_id))}${field("Verbindungstyp", `<input name="connection_type" required value="${escapeHtml(connection?.connection_type ?? "")}">`)}${field("Beschreibung", `<textarea name="description">${escapeHtml(connection?.description ?? "")}</textarea>`)}${sourceInputs(connection, true)}<label class="check-row"><input type="checkbox" name="published" ${checked(connection?.published)}> Veröffentlicht</label><button class="button" type="submit">Verbindung speichern</button></form>${genericList(data.connections, "connectionEdit", "film_connections", (item) => item.connection_type)}</section></div>`;
}

function publicShell(catalog = idleCatalog(), title, code) {
  if (["ready", "empty"].includes(catalog.status)) return null;
  const message = catalog.status === "error" ? (catalog.errorCode === "configuration" ? "CageDB ist noch nicht mit einem Supabase-Projekt verbunden." : "Die veröffentlichten Daten konnten nicht geladen werden.") : "Veröffentlichte Daten werden geladen.";
  return `<article class="view" data-view="public-state"><header class="route-head"><p class="eyebrow">${escapeHtml(code)}</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></header>${catalog.status === "error" ? `<button class="button" type="button" data-public-retry>Erneut versuchen</button>` : `<div class="panel" aria-busy="true">Datenbankabfrage läuft …</div>`}</article>`;
}

function filmCard(film) {
  return `<article class="film-card" ${genreStyle(film)}>${poster(film)}<div class="film-card__body"><p class="meta-line">${escapeHtml(film.releaseYear ?? "—")} · ${escapeHtml(genreNames(film))}</p><h3><a href="#/film/${encodeURIComponent(film.id)}">${escapeHtml(film.displayTitle)}</a></h3><div class="chip-row"><span class="status-chip" data-tone="${film.watched ? "seen" : "watchlist"}">${film.watched ? `${film.myRatingPercent} %` : "Watchlist"}</span>${film.tags.slice(0, 3).map((tag) => `<span class="status-chip">${escapeHtml(tag.name)}</span>`).join("")}</div></div></article>`;
}

function poster(film, fallback = "CAGE DB") {
  const title = film?.displayTitle ?? fallback;
  const placeholder = `<div class="poster-placeholder" role="img" aria-label="Kein Filmplakat für ${escapeHtml(title)} verfügbar"><span>CAGE</span><span>DB</span></div>`;
  if (!film?.posterUrl && !film?.poster_public_url) return placeholder;
  const src = film.posterUrl ?? film.poster_public_url;
  return `<div class="poster-media" data-poster-media>${placeholder}<img src="${escapeHtml(src)}" alt="Filmplakat zu ${escapeHtml(title)}" loading="lazy" decoding="async" data-poster-image data-fallback-label="Kein Filmplakat für ${escapeHtml(title)} verfügbar"></div>`;
}

function metricList(metrics) {
  return `<dl class="meter-list">${CAGE_METRICS.map(({ key, label }) => { const value = metrics[key]; return `<div><dt>${escapeHtml(label)}</dt><dd>${value == null ? "Nicht bewertet" : `${value} von 5`}<span class="meter-bar" aria-hidden="true"><i style="--meter:${value == null ? 0 : value * 20}%"></i></span></dd></div>`; }).join("")}</dl>`;
}

function scoreBlock(rt, imdb) {
  if (!rt && !imdb) return `<p>Keine belegten externen Scores veröffentlicht.</p>`;
  return `<dl class="score-list">${rt ? `<div><dt>Rotten Tomatoes</dt><dd>${rt.rtTomatometerPercent == null ? "—" : `${rt.rtTomatometerPercent} % Kritiker`} · ${rt.rtAudiencePercent == null ? "—" : `${rt.rtAudiencePercent} % Publikum`}<br>${sourceLink(rt, rt.retrievedAt)}</dd></div>` : ""}${imdb ? `<div><dt>IMDb</dt><dd>${DECIMAL.format(imdb.imdbScore)} / 10<br>${sourceLink(imdb, imdb.retrievedAt)}</dd></div>` : ""}</dl>`;
}

function chartSection(id, title, rows) {
  const maximum = Math.max(1, ...rows.map((row) => row.value));
  return `<section class="panel chart-panel" aria-labelledby="${id}-title"><h2 id="${id}-title">${escapeHtml(title)}</h2>${rows.length ? `<div class="bar-chart" aria-hidden="true">${rows.map((row) => `<div><span>${escapeHtml(row.label)}</span><i style="--bar:${(row.value / maximum) * 100}%"></i><b>${row.value}</b></div>`).join("")}</div>${dataTable(["Kategorie", "Filme"], rows.map((row) => [row.label, row.value]), `${title} als Datentabelle`)}` : `<p>Noch keine Daten.</p>`}</section>`;
}

function ranking(title, films) {
  return `<section class="panel"><h2>${escapeHtml(title)}</h2>${films.length ? `<ol class="ranking">${films.map((film) => `<li><a href="#/film/${encodeURIComponent(film.id)}">${escapeHtml(film.displayTitle)}</a><strong>${film.myRatingPercent} %</strong></li>`).join("")}</ol>` : `<p>Noch keine persönlichen Bewertungen.</p>`}</section>`;
}

function dataTable(headers, rows, caption = null) {
  return `<div class="table-shell"><table>${caption ? `<caption>${escapeHtml(caption)}</caption>` : ""}<thead><tr>${headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell, index) => `<${index === 0 ? "th scope=\"row\"" : "td"}>${escapeHtml(cell)}</${index === 0 ? "th" : "td"}>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function editorialCard(item) {
  const quote = item.contentType === "quote";
  return `<article class="module-card editorial-card"><span class="code-label">${quote ? "ZITAT" : "FAKT"}</span><h3>${escapeHtml(item.title ?? (quote ? "Zitat" : "Fakt"))}</h3>${quote ? `<blockquote><p>${nl2br(item.body)}</p><footer>— ${escapeHtml(item.quoteAttribution)}</footer></blockquote>` : `<p>${nl2br(item.body)}</p>`}${sourceLink(item)}</article>`;
}

function upcomingSection(items) {
  return `<section aria-labelledby="upcoming-title"><div class="section-heading"><div><p class="code-label">RELEASES / SOURCED</p><h2 id="upcoming-title">Kommende Veröffentlichungen</h2></div></div>${items.length ? `<div class="module-grid">${items.map((item) => `<article class="module-card"><span class="code-label">${escapeHtml(item.expectedReleaseDate ? formatDate(item.expectedReleaseDate) : item.expectedReleaseWindow ?? "Termin offen")}</span><h3>${escapeHtml(item.displayTitle)}</h3><p>${escapeHtml([item.roleName, item.statusLabel].filter(Boolean).join(" · ") || "Details offen")}</p>${sourceLink(item, item.sourceCheckedAt)}</article>`).join("")}</div>` : emptyState("0 RELEASES", "Keine kommenden Veröffentlichungen", "Nur geprüfte, veröffentlichte Einträge erscheinen hier.")}</section>`;
}

function csvPreview(preview) {
  return `<section class="panel" aria-labelledby="csv-preview-title"><h3 id="csv-preview-title">Vorschau</h3><dl class="summary-list"><div><dt>Zeilen</dt><dd>${preview.stats.total}</dd></div><div><dt>Gesehen</dt><dd>${preview.stats.rated}</dd></div><div><dt>Watchlist</dt><dd>${preview.stats.watchlist}</dd></div><div><dt>Verworfene Zusatzspalten</dt><dd>${preview.stats.ignoredColumnCount}</dd></div><div><dt>Zeilen mit externen Alt-Scores</dt><dd>${preview.stats.externalScoreRows}</dd></div></dl><h4>Erkannte Konflikte</h4>${preview.conflicts.length ? `<ul>${preview.conflicts.map((item) => `<li>Zeile ${item.rowNumber}, ID ${escapeHtml(item.legacyImportId)}: ${escapeHtml(item.resolution)}</li>`).join("")}</ul>` : `<p>Keine Status-/Bewertungswidersprüche erkannt.</p>`}<p class="notice">Persönliche Bewertung ist die einzige Quelle für „gesehen“. Externe Alt-Scores werden nicht angewendet.</p><button class="button" type="button" data-csv-apply>Vorschau verbindlich importieren</button></section>`;
}

function adminNavigation(active) {
  const links = [["admin", "#/admin", "Dashboard"], ["admin-films", "#/admin/filme", "Filme"], ["admin-genres", "#/admin/genres", "Genres & Tags"], ["admin-import", "#/admin/import", "CSV & Backup"], ["admin-editorial", "#/admin/redaktion", "Redaktion"]];
  return `<nav class="admin-nav" aria-label="Adminnavigation">${links.map(([id, href, label]) => `<a href="${href}" ${active === id || (active === "admin-login" && id === "admin") ? 'aria-current="page"' : ""}>${label}</a>`).join("")}</nav>`;
}

function adminGate(title, description, logout = false) {
  return `<article class="view" data-view="admin-locked"><header class="route-head"><p class="eyebrow">PRIVATE / LOCKED</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></header><div class="admin-lock"><span class="admin-lock__glyph" aria-hidden="true">LOCK</span><p>Öffentliche Daten und Bearbeitungsfunktionen bleiben strikt getrennt.</p>${logout ? `<button class="button button--secondary" type="button" data-admin-logout>Abmelden</button>` : `<a class="button" href="#/admin/login">Zur Anmeldung</a>`}</div></article>`;
}

function adminNotice(session) {
  return session.notice ? `<p class="notice" role="status" data-tone="${escapeHtml(session.notice.tone ?? "info")}">${escapeHtml(session.notice.message)}</p>` : "";
}

function posterAdminForm(film) {
  return `<section class="panel"><h3>Poster</h3><div class="poster-admin">${poster(film)}<div><form class="form-stack" data-poster-upload><input type="hidden" name="film_id" value="${film.id}">${field("Posterdatei (max. 8 MB)", `<input type="file" name="poster" accept="image/jpeg,image/png,image/webp,image/avif" required>`)}<button class="button" type="submit">Poster hochladen</button></form>${film.poster_path ? `<button class="button button--danger" type="button" data-poster-remove="${film.id}">Poster entfernen</button>` : ""}</div></div></section>`;
}

function scoreFields(title, prefix, score, isRt) {
  return `<fieldset><legend>${escapeHtml(title)} · nur mit Quelle</legend><div class="form-grid">${isRt ? `${field("Kritiker %", `<input type="number" name="${prefix}_tomatometer" min="0" max="100" value="${escapeHtml(score.rt_tomatometer_percent ?? "")}">`)}${field("Publikum %", `<input type="number" name="${prefix}_audience" min="0" max="100" value="${escapeHtml(score.rt_audience_percent ?? "")}">`)}` : field("Score 0–10", `<input type="number" name="${prefix}_score" min="0" max="10" step="0.1" value="${escapeHtml(score.imdb_score ?? "")}">`)}${field("HTTPS-Quelle", `<input type="url" name="${prefix}_source_url" pattern="https://.*" value="${escapeHtml(score.source_url ?? "")}">`)}${field("Abrufdatum", `<input type="date" name="${prefix}_retrieved_at" value="${escapeHtml(score.retrieved_at ?? "")}">`)}</div></fieldset>`;
}

function sourceInputs(record, checkedAt = false) {
  return `<div class="form-grid">${field("Quellenbezeichnung", `<input name="source_label" value="${escapeHtml(record?.source_label ?? "")}">`)}${field("Quellen-URL (HTTPS)", `<input type="url" name="source_url" pattern="https://.*" value="${escapeHtml(record?.source_url ?? "")}">`)}${checkedAt ? field("Quelle geprüft am", `<input type="date" name="source_checked_at" value="${escapeHtml(record?.source_checked_at ?? "")}" required>`) : ""}</div>`;
}

function genericList(items, queryKey, table, labelFor) {
  return `<div class="admin-record-list">${items.map((item) => `<div><a href="#/admin/redaktion?${queryKey}=${encodeURIComponent(item.id)}"><span>${escapeHtml(labelFor(item))}</span><small>${item.published ? "Live" : "Entwurf"}</small></a><button type="button" data-delete-record="${item.id}" data-table="${table}" data-label="${escapeHtml(labelFor(item))}">Löschen</button></div>`).join("")}</div>`;
}

function lookupList(items, queryKey, table) {
  return `<div class="admin-record-list">${items.map((item) => `<div><a href="#/admin/genres?${queryKey}=${encodeURIComponent(item.id)}"><span>${escapeHtml(item.name)}</span><small>${item.published ? "Live" : "Entwurf"}</small></a><button type="button" data-delete-record="${item.id}" data-table="${table}" data-label="${escapeHtml(item.name)}">Löschen</button></div>`).join("")}</div>`;
}

function field(label, control) { return `<label class="field"><span>${escapeHtml(label)}</span>${control}</label>`; }
function metricInput(label, name, value) { return field(label, `<input type="number" name="metric_${name}" min="0" max="5" step="1" value="${escapeHtml(value ?? "")}">`); }
function checkbox(name, value, label, isChecked) { return `<label class="check-row"><input type="checkbox" name="${name}" value="${escapeHtml(value)}" ${isChecked ? "checked" : ""}> ${escapeHtml(label)}</label>`; }
function select(name, placeholder, options, current) { return `<select name="${escapeHtml(name)}">${placeholder ? `<option value="">${escapeHtml(placeholder)}</option>` : ""}${options.map(([value, label]) => `<option value="${escapeHtml(value)}" ${String(current ?? "") === String(value) ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select>`; }
function checked(value) { return value ? "checked" : ""; }
function firstQuery(route, key) { const value = route.location?.query?.[key]; return Array.isArray(value) ? value[0] : value; }
function statCard(label, value, description) { return `<article class="stat-card"><span class="code-label">${escapeHtml(label)}</span><strong class="stat-card__value">${escapeHtml(value)}</strong><p>${escapeHtml(description)}</p></article>`; }
function cageStatCard(cage) {
  const overall = cage?.overall == null ? "—" : `${DECIMAL.format(cage.overall)} / 5`;
  return `<article class="stat-card stat-card--metrics"><span class="code-label">Cage-o-meter</span><strong class="stat-card__value">${overall}</strong><dl class="metric-summary" aria-label="Durchschnittliche Cage-o-meter-Werte">${CAGE_METRICS.map(({ key, label }) => `<div><dt>${escapeHtml(label)}</dt><dd>${cage?.metrics?.[key] == null ? "—" : `${DECIMAL.format(cage.metrics[key])} / 5`}</dd></div>`).join("")}</dl><p>${cage?.assessedFilms ?? 0} Filme bewertet</p></article>`;
}
function moduleCard(index, title, body, href) { return `<a class="module-card" href="${href}"><span class="module-card__index">${index}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></a>`; }
function tagList(tags) { return tags.length ? `<ul class="chip-row">${tags.map((tag) => `<li class="status-chip">${escapeHtml(tag.name)}</li>`).join("")}</ul>` : `<p>Keine Tags gesetzt.</p>`; }
function genreNames(film) { return film.genres.length ? film.genres.map((genre) => genre.name).join(", ") : "Ohne Genre"; }
function genreStyle(film) { const color = film.genres[0]?.accentColor; return color && /^#[0-9a-f]{6}$/i.test(color) ? `style="--card-accent:${color}"` : `data-genre="none"`; }
function nl2br(value) { return escapeHtml(value).replaceAll("\n", "<br>"); }
function formatDate(value) { const date = new Date(`${value}T00:00:00Z`); return Number.isNaN(date.getTime()) ? value : DATE.format(date); }
function sourceLink(item, checkedAt = null) { const label = item.sourceLabel ?? "Quelle"; const suffix = checkedAt ? ` · Stand ${escapeHtml(formatDate(checkedAt))}` : ""; return item.sourceUrl ? `<p class="source-line">Quelle: <a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>${suffix}</p>` : item.sourceLabel ? `<p class="source-line">Quelle: ${escapeHtml(label)}${suffix}</p>` : ""; }
function emptyState(glyph, title, body) { return `<div class="empty-state"><span class="empty-state__glyph" aria-hidden="true">${escapeHtml(glyph)}</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p></div>`; }
function loadingCard(title, message) { return `<aside class="feature-card feature-card--loading" data-genre="none" aria-busy="true"><p class="code-label">QUERY</p><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p></aside>`; }
function dataErrorCard(catalog, title) { return `<aside class="feature-card feature-card--error" data-genre="none"><p class="code-label">QUERY / FEHLER</p><h2>${escapeHtml(title)}</h2><p>${catalog.errorCode === "configuration" ? "Supabase-Konfiguration fehlt." : "Daten nicht erreichbar."}</p><button class="button button--secondary" type="button" data-public-retry>Erneut versuchen</button></aside>`; }
function catalogMessage(catalog) { const data = readyData(catalog); if (data) return `${data.stats.total} veröffentlichte Filme · live aus CageDB.`; return catalog.status === "error" ? "Daten nicht geladen." : "Daten werden geladen."; }
function readyData(catalog) { return ["ready", "empty"].includes(catalog?.status) ? catalog.data : null; }
function idleCatalog() { return { status: "idle", data: null, errorCode: null }; }
function renderNotFound(path) { return `<article class="view" data-view="not-found"><header class="route-head"><p class="eyebrow">HTTP / 404</p><h1>Ansicht nicht gefunden</h1><p>Für „${escapeHtml(path)}“ existiert keine Route.</p></header><a class="button" href="#/">Zur Startseite</a></article>`; }
