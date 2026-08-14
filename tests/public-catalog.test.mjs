// tests/public-catalog.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

import {
  PublicCatalogError,
  loadPublicHomeCatalog,
} from "../public/js/services/public-catalog.mjs";
import {
  PublicConfigError,
  assertPublicConfig,
} from "../public/js/services/public-config.mjs";

const VALID_CONFIG = Object.freeze({
  timezone: "Europe/Berlin",
  posterBucket: "film-posters",
  supabaseUrl: "https://project.supabase.co",
  supabaseAnonKey: "sb_publishable_test",
});

test("queries only published films and merges public Cage-o-meter rows", async () => {
  const { client, calls } = createFakeClient({
    films: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        legacy_import_id: "legacy-1",
        release_year: 2020,
        original_title: "Test Film",
        german_title: null,
        display_title: "Test Film",
        my_rating_percent: null,
        poster_path: "00000000-0000-4000-8000-000000000001/poster.webp",
        film_genres: [],
      },
    ],
    metrics: [
      {
        film_id: "00000000-0000-4000-8000-000000000001",
        wig: 2,
        scream_intensity: 3,
        explosions: 4,
        overacting_level: 5,
      },
    ],
    filmGenres: [
      {
        film_id: "00000000-0000-4000-8000-000000000001",
        genre_id: "20000000-0000-4000-8000-000000000001",
      },
    ],
    genres: [
      {
        id: "20000000-0000-4000-8000-000000000001",
        name: "Action",
        slug: "action",
        accent_color: "#ff725e",
      },
    ],
  });

  const result = await loadPublicHomeCatalog({
    client,
    config: VALID_CONFIG,
    now: new Date("2026-08-14T12:00:00.000Z"),
  });

  assert.equal(result.stats.total, 1);
  assert.equal(result.stats.watchlist, 1);
  assert.equal(result.dailyFilm.id, "00000000-0000-4000-8000-000000000001");
  assert.equal(result.dailyFilm.metrics.overactingLevel, 5);
  assert.equal(result.dailyFilm.genres[0].slug, "action");
  assert.match(result.dailyFilm.posterUrl, /film-posters/);
  assert.ok(
    calls.some(
      (call) =>
        call.table === "films" &&
        call.method === "eq" &&
        call.args[0] === "published" &&
        call.args[1] === true,
    ),
  );
  for (const table of ["tags", "editorial_content", "upcoming_releases", "film_connections"]) {
    assert.ok(
      calls.some(
        (call) => call.table === table && call.method === "eq" &&
          call.args[0] === "published" && call.args[1] === true,
      ),
      `${table} must be explicitly limited to published rows`,
    );
  }
  assert.ok(
    calls.some((call) => call.table === "film_tags" && call.method === "in" && call.args[0] === "film_id"),
  );
  assert.ok(
    calls.some((call) => call.table === "film_scores" && call.method === "not" && call.args[0] === "source_url"),
  );
  assert.ok(
    calls.some(
      (call) =>
        call.table === "genres" &&
        call.method === "eq" &&
        call.args[0] === "published" &&
        call.args[1] === true,
    ),
  );
  assert.ok(
    calls.some(
      (call) =>
        call.table === "film_metrics" &&
        call.method === "in" &&
        call.args[0] === "film_id" &&
        call.args[1].length === 1,
    ),
  );
});

test("rejects placeholder configuration before issuing a query", async () => {
  const { client, calls } = createFakeClient({ films: [], metrics: [] });

  await assert.rejects(
    () =>
      loadPublicHomeCatalog({
        client,
        config: {
          ...VALID_CONFIG,
          supabaseUrl: "https://YOUR_PROJECT_REF.supabase.co",
        },
      }),
    (error) =>
      error instanceof PublicCatalogError && error.code === "configuration",
  );
  assert.equal(calls.length, 0);
});

test("maps database failures to a non-sensitive request error", async () => {
  const { client } = createFakeClient({
    films: [],
    metrics: [],
    filmsError: { message: "private backend detail" },
  });

  await assert.rejects(
    () => loadPublicHomeCatalog({ client, config: VALID_CONFIG }),
    (error) =>
      error instanceof PublicCatalogError &&
      error.code === "request" &&
      !error.message.includes("private backend detail"),
  );
});

test("distinguishes an invalid payload from a client/network failure", async () => {
  const invalidPayload = createFakeClient({
    films: [{ id: "film-without-title", film_genres: [] }],
    metrics: [],
  }).client;

  await assert.rejects(
    () => loadPublicHomeCatalog({ client: invalidPayload, config: VALID_CONFIG }),
    (error) =>
      error instanceof PublicCatalogError && error.code === "invalid-data",
  );

  await assert.rejects(
    () =>
      loadPublicHomeCatalog({
        client: {
          from() {
            throw new TypeError("connection failed");
          },
        },
        config: VALID_CONFIG,
      }),
    (error) => error instanceof PublicCatalogError && error.code === "network",
  );
});

test("accepts HTTPS and local HTTP configuration only", () => {
  assert.equal(assertPublicConfig(VALID_CONFIG).supabaseUrl, VALID_CONFIG.supabaseUrl);
  assert.equal(
    assertPublicConfig({
      ...VALID_CONFIG,
      supabaseUrl: "http://127.0.0.1:54321/",
    }).supabaseUrl,
    "http://127.0.0.1:54321",
  );
  assert.throws(
    () =>
      assertPublicConfig({
        ...VALID_CONFIG,
        supabaseUrl: "http://example.com",
      }),
    PublicConfigError,
  );
});

function createFakeClient({
  films,
  metrics,
  filmGenres = [],
  genres = [],
  tags = [],
  filmTags = [],
  scores = [],
  editorial = [],
  upcoming = [],
  connections = [],
  filmsError = null,
  metricsError = null,
}) {
  const calls = [];
  const responses = {
    films: { data: films, error: filmsError },
    film_metrics: { data: metrics, error: metricsError },
    film_genres: { data: filmGenres, error: null },
    genres: { data: genres, error: null },
    tags: { data: tags, error: null },
    film_tags: { data: filmTags, error: null },
    film_scores: { data: scores, error: null },
    editorial_content: { data: editorial, error: null },
    upcoming_releases: { data: upcoming, error: null },
    film_connections: { data: connections, error: null },
  };

  const client = {
    from(table) {
      const query = {
        select(...args) {
          calls.push({ table, method: "select", args });
          return query;
        },
        eq(...args) {
          calls.push({ table, method: "eq", args });
          return query;
        },
        in(...args) {
          calls.push({ table, method: "in", args });
          return query;
        },
        not(...args) {
          calls.push({ table, method: "not", args });
          return query;
        },
        order(...args) {
          calls.push({ table, method: "order", args });
          return query;
        },
        then(resolve, reject) {
          return Promise.resolve(responses[table]).then(resolve, reject);
        },
      };
      return query;
    },
    storage: {
      from(bucket) {
        return {
          getPublicUrl(path) {
            return {
              data: {
                publicUrl: `https://project.supabase.co/storage/v1/object/public/${bucket}/${path}`,
              },
            };
          },
        };
      },
    },
  };

  return { client, calls };
}
