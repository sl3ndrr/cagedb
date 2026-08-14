// tests/catalog-domain.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

import {
  archiveFiltersFromQuery,
  buildArchiveOptions,
  calculatePublicStatistics,
  filterFilms,
  selectWatchlistFilm,
} from "../public/js/domain/catalog.mjs";

const films = [
  film("a", "Mandy", 2018, 91, [{ name: "Action", slug: "action" }], [tag("wild", "Wild", "general")]),
  film("b", "Adaption", 2002, 44, [], [tag("bee", "Bienen", "running_gag")]),
  film("c", "Résumé", 1999, null, [{ name: "Drama", slug: "drama" }], [tag("bee", "Bienen", "running_gag")], 1),
  film("d", "Offenes Jahr", null, null, [], [], 2),
];

test("combines archive search, status, genre, rating and tag filters", () => {
  assert.deepEqual(filterFilms(films, { query: "resume" }).map((item) => item.id), ["c"]);
  assert.deepEqual(filterFilms(films, { status: "seen", ratingMin: "80" }).map((item) => item.id), ["a"]);
  assert.deepEqual(filterFilms(films, { genre: "none", tag: "bee" }).map((item) => item.id), ["b"]);
  assert.deepEqual(filterFilms(films, { decade: "2000" }).map((item) => item.id), ["b"]);
});

test("sanitizes invalid hash-query filters", () => {
  const filters = archiveFiltersFromQuery({
    q: ["Mandy", "ignored"], year: "4000", decade: "2005", status: "draft", ratingMin: "-1",
  });
  assert.equal(filters.query, "Mandy");
  assert.equal(filters.year, "");
  assert.equal(filters.decade, "");
  assert.equal(filters.status, "all");
  assert.equal(filters.ratingMin, "");
});

test("builds dynamic archive options including the no-genre gap", () => {
  const result = buildArchiveOptions(films, [{ name: "Drama", slug: "drama" }], []);
  assert.deepEqual(result.years, [2018, 2002, 1999]);
  assert.deepEqual(result.decades, [2010, 2000, 1990]);
  assert.equal(result.hasGenreGap, true);
});

test("calculates rankings, progress, decades, genres and running gags from records", () => {
  const stats = calculatePublicStatistics(films);
  assert.equal(stats.total, 4);
  assert.equal(stats.seen, 2);
  assert.equal(stats.progressPercent, 50);
  assert.deepEqual(stats.top.map((item) => item.id), ["a", "b"]);
  assert.deepEqual(stats.flop.map((item) => item.id), ["b", "a"]);
  assert.equal(stats.genres.find((row) => row.key === "none").value, 2);
  assert.equal(stats.runningGags[0].value, 2);
  assert.ok(stats.decades.some((row) => row.label === "Jahr unbekannt"));
});

test("selects only watchlist films and respects random boundaries", () => {
  assert.equal(selectWatchlistFilm(films, 0).id, "c");
  assert.equal(selectWatchlistFilm(films, 0.999999).id, "d");
  assert.equal(selectWatchlistFilm(films.filter((item) => item.watched), 0), null);
});

function film(id, displayTitle, releaseYear, rating, genres, tags, priority = null) {
  return {
    id,
    displayTitle,
    originalTitle: displayTitle,
    germanTitle: null,
    legacyImportId: id,
    releaseYear,
    myRatingPercent: rating,
    watched: rating !== null,
    watchlistPriority: priority,
    genres: genres.map((genre) => ({ ...genre, accentColor: null })),
    tags,
  };
}

function tag(slug, name, kind) {
  return { id: slug, slug, name, kind };
}
