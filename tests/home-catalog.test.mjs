// tests/home-catalog.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHomeCatalog,
  calculateCatalogStats,
  getZonedDateKey,
  normalizePublicFilms,
  selectFilmOfDay,
} from "../public/js/domain/home-catalog.mjs";

test("uses the Europe/Berlin calendar date at the UTC day boundary", () => {
  assert.equal(
    getZonedDateKey(new Date("2026-01-01T22:59:59.000Z"), "Europe/Berlin"),
    "2026-01-01",
  );
  assert.equal(
    getZonedDateKey(new Date("2026-01-01T23:00:00.000Z"), "Europe/Berlin"),
    "2026-01-02",
  );
  assert.equal(
    getZonedDateKey(new Date("2026-07-01T21:59:59.000Z"), "Europe/Berlin"),
    "2026-07-01",
  );
  assert.equal(
    getZonedDateKey(new Date("2026-07-01T22:00:00.000Z"), "Europe/Berlin"),
    "2026-07-02",
  );
});

test("selects the same daily watchlist film regardless of source row order", () => {
  const films = [
    film("film-c", "3", null),
    film("film-a", "1", null),
    film("film-b", "2", null),
    film("film-seen", "4", 0),
  ];
  const options = {
    now: new Date("2026-08-14T10:00:00.000Z"),
    timeZone: "Europe/Berlin",
  };

  const first = selectFilmOfDay(films, options);
  const second = selectFilmOfDay([...films].reverse(), options);

  assert.equal(first.film.id, second.film.id);
  assert.equal(first.dateKey, "2026-08-14");
  assert.equal(first.candidateCount, 3);
  assert.notEqual(first.film.id, "film-seen");
});

test("treats a zero-percent rating as seen and averages only present values", () => {
  const films = [
    film("film-a", "1", 0, {
      wig: 0,
      screamIntensity: 5,
      explosions: null,
      overactingLevel: null,
    }),
    film("film-b", "2", 80, {
      wig: 4,
      screamIntensity: null,
      explosions: 2,
      overactingLevel: 4,
    }),
    film("film-c", "3", null),
  ];

  const stats = calculateCatalogStats(films);

  assert.equal(stats.total, 3);
  assert.equal(stats.seen, 2);
  assert.equal(stats.watchlist, 1);
  assert.equal(stats.averageRating, 40);
  assert.equal(stats.cageOMeter.metrics.wig, 2);
  assert.equal(stats.cageOMeter.metrics.screamIntensity, 5);
  assert.equal(stats.cageOMeter.overall, 3);
  assert.equal(stats.cageOMeter.assessedFilms, 2);
});

test("normalizes title fallback, genres, metrics, and trusted poster URLs", () => {
  const result = buildHomeCatalog(
    {
      filmRows: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          legacy_import_id: "legacy-1",
          release_year: 1997,
          original_title: "Original",
          german_title: "– Zusatz",
          display_title: null,
          my_rating_percent: null,
          poster_path: "film/poster.webp",
          film_genres: [
            {
              genres: {
                name: "Action",
                slug: "action",
                accent_color: "#FF725E",
              },
            },
          ],
        },
      ],
      metricRows: [
        {
          film_id: "00000000-0000-4000-8000-000000000001",
          wig: 1,
          scream_intensity: 2,
          explosions: 3,
          overacting_level: 4,
        },
      ],
    },
    {
      now: new Date("2026-08-14T12:00:00.000Z"),
      posterUrlForPath: (path) => `https://project.supabase.co/storage/${path}`,
    },
  );

  assert.equal(result.films[0].displayTitle, "Original – Zusatz");
  assert.equal(result.films[0].watched, false);
  assert.equal(result.films[0].genres[0].accentColor, "#ff725e");
  assert.equal(result.films[0].metrics.overactingLevel, 4);
  assert.match(result.films[0].posterUrl, /^https:\/\/project\.supabase\.co\//);
  assert.equal(Object.isFrozen(result.films[0]), true);
});

test("returns no daily film when every published film has a rating", () => {
  const result = selectFilmOfDay(
    [film("film-a", "1", 0), film("film-b", "2", 100)],
    { now: new Date("2026-08-14T12:00:00.000Z") },
  );

  assert.equal(result.film, null);
  assert.equal(result.candidateCount, 0);
});

test("rejects values outside the database contract", () => {
  assert.throws(
    () =>
      normalizePublicFilms([
        {
          id: "film-a",
          original_title: "A",
          my_rating_percent: 101,
          film_genres: [],
        },
      ]),
    /data contract/,
  );
});

function film(id, legacyImportId, rating, metrics = null) {
  return {
    id,
    legacyImportId,
    myRatingPercent: rating,
    metrics: metrics ?? {
      wig: null,
      screamIntensity: null,
      explosions: null,
      overactingLevel: null,
    },
  };
}
