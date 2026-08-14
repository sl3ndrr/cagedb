// tests/feature-views.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

import { ROUTES } from "../public/js/routes.mjs";
import { renderRouteView } from "../public/js/views.mjs";

const film = {
  id: "00000000-0000-4000-8000-000000000001",
  legacyImportId: "1",
  releaseYear: 2001,
  originalTitle: "Original",
  germanTitle: "Deutsch",
  displayTitle: "Deutsch",
  myRatingPercent: 80,
  watched: true,
  notes: "Notiz",
  watchlistPriority: null,
  posterUrl: null,
  genres: [{ id: "g1", name: "Action", slug: "action", accentColor: "#ff725e" }],
  tags: [{ id: "t1", name: "Bienen", slug: "bienen", kind: "running_gag" }],
  metrics: { wig: 1, screamIntensity: 2, explosions: 3, overactingLevel: 4 },
  scores: [{ provider: "imdb", imdbScore: 6.5, rtTomatometerPercent: null, rtAudiencePercent: null, sourceUrl: "https://example.com/score", retrievedAt: "2026-08-14" }],
};

const publicCatalog = {
  status: "ready",
  errorCode: null,
  data: {
    films: [film, { ...film, id: "00000000-0000-4000-8000-000000000002", legacyImportId: "2", displayTitle: "Watchlist", myRatingPercent: null, watched: false, watchlistPriority: 1, genres: [], tags: [], scores: [] }],
    genres: film.genres,
    tags: film.tags,
    stats: { total: 2, seen: 1, watchlist: 1, averageRating: 80, cageOMeter: { overall: 2.5, assessedFilms: 2, metrics: {} } },
    dailyFilm: null,
    dailyDateKey: "2026-08-14",
    dailyCandidateCount: 1,
    editorialContent: [
      { id: "e1", contentType: "biography", title: "Bio", body: "Text", sourceLabel: null, sourceUrl: null },
      { id: "e2", contentType: "fact", title: "Belegt", body: "Fakt", sourceLabel: "Quelle", sourceUrl: "https://example.com/fact" },
      { id: "e3", contentType: "fact", title: "Nicht anzeigen", body: "Ohne", sourceLabel: null, sourceUrl: null },
    ],
    upcomingReleases: [],
    connections: [{ id: "c1", sourceFilmId: film.id, targetFilmId: "00000000-0000-4000-8000-000000000002", connectionType: "Verbindung", description: null, sourceLabel: "Quelle", sourceUrl: "https://example.com/link", sourceCheckedAt: "2026-08-14" }],
  },
};

test("renders every completed public feature with one heading and live data", () => {
  for (const id of ["films", "film-detail", "stats", "bio", "wall", "wheel", "universe"]) {
    const definition = ROUTES.find((item) => item.id === id);
    const route = {
      ...definition,
      location: { path: definition.pattern, query: id === "films" ? { genre: "action" } : {} },
      params: id === "film-detail" ? { id: film.id } : {},
    };
    const html = renderRouteView(route, { publicCatalog, wheelFilmId: film.id });
    assert.equal([...html.matchAll(/<h1(?:\s|>)/g)].length, 1, id);
    assert.equal(html.includes("undefined"), false, id);
  }
});

test("provides accessible statistics tables and sourced external links", () => {
  const stats = render("stats");
  const detail = render("film-detail", { id: film.id });
  assert.match(stats, /<table>/);
  assert.match(stats, /<progress/);
  assert.match(detail, /rel="noopener noreferrer"/);
  assert.match(detail, /6,5 \/ 10/);
});

test("does not render fact cards without a source label", () => {
  const html = render("bio");
  assert.match(html, /Belegt/);
  assert.equal(html.includes("Nicht anzeigen"), false);
});

test("shows edit controls only after verified admin state and escapes database values", () => {
  const definition = ROUTES.find((item) => item.id === "admin-films");
  const route = { ...definition, location: { path: definition.pattern, query: {} }, params: {} };
  const locked = renderRouteView(route, { session: { status: "checking" } });
  const ready = renderRouteView(route, {
    session: {
      status: "ready",
      data: {
        films: [{ id: "f1", display_title: '<img src=x onerror="x">', original_title: "Safe", german_title: null, release_year: 2000, my_rating_percent: null, watchlist_priority: 1, published: false, poster_path: null, poster_public_url: null }],
        genres: [], filmGenres: [], metrics: [], tags: [], filmTags: [], scores: [], editorial: [], upcoming: [], connections: [],
      },
      notice: null,
      csvPreview: null,
    },
  });
  assert.equal(/<(form|input|textarea|select)\b/i.test(locked), false);
  assert.match(ready, /data-film-form/);
  assert.equal(ready.includes("<img src=x"), false);
  assert.match(ready, /&lt;img src=x/);
});

function render(id, params = {}) {
  const definition = ROUTES.find((item) => item.id === id);
  return renderRouteView({ ...definition, location: { path: definition.pattern, query: {} }, params }, { publicCatalog });
}
