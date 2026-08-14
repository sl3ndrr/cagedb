// tools/initial-import/import-core.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

import {
  ImportValidationError,
  SOURCE_COLUMNS,
  analyzeSourceTable,
  parseCsv,
  resolveImportSecretKey,
} from "./import-core.mjs";

test("parses RFC 4180 quoting, commas, and escaped quotes", () => {
  const table = parseCsv(
    'a,b,c\r\n1,"two, parts","quote ""inside"""\r\n',
  );

  assert.deepEqual(table.headers, ["a", "b", "c"]);
  assert.deepEqual(table.rows[0], ["1", "two, parts", 'quote "inside"']);
});

test("uses the personal rating as the only watched source of truth", () => {
  const table = {
    headers: [...SOURCE_COLUMNS],
    rows: [
      ["film-1", 2001, "Alpha", null, 80, false, "watchlist", 70, 60, 6.5],
      ["film-2", 2002, "Beta", null, null, true, "watched", 50, 40, 5.2],
    ],
  };

  const analysis = analyzeSourceTable(table, { expectedCount: 2 });

  assert.equal(analysis.stats.rated, 1);
  assert.equal(analysis.stats.watchlist, 1);
  assert.equal(analysis.stats.conflictRatingOverrides, 1);
  assert.equal(analysis.stats.conflictMissingRating, 1);
  assert.equal(analysis.conflicts[0].resolvedWatched, true);
  assert.equal(analysis.conflicts[1].resolvedWatched, false);
  assert.equal("watched" in analysis.records[0], false);
  assert.equal("status" in analysis.records[0], false);
});

test("discards unknown columns without returning their names or values", () => {
  const marker = "must-not-leave-source";
  const table = {
    headers: [...SOURCE_COLUMNS, "obsolete_private_field"],
    rows: [
      ["film-1", 2001, "Alpha", null, null, false, "watchlist", null, null, null, marker],
    ],
  };

  const analysis = analyzeSourceTable(table, { expectedCount: 1 });
  const serialized = JSON.stringify(analysis);

  assert.equal(analysis.stats.discardedColumnCount, 1);
  assert.equal(serialized.includes("obsolete_private_field"), false);
  assert.equal(serialized.includes(marker), false);
});

test("rejects invalid ranges and IMDb precision", () => {
  const table = {
    headers: [...SOURCE_COLUMNS],
    rows: [
      ["film-1", 2001, "Alpha", null, 101, true, "watched", 70, 60, 6.55],
    ],
  };

  assert.throws(
    () => analyzeSourceTable(table, { expectedCount: 1 }),
    (error) =>
      error instanceof ImportValidationError &&
      error.issues.some((issue) => issue.includes("my_rating_percent")) &&
      error.issues.some((issue) => issue.includes("imdb_score")),
  );
});

test("requires the complete ten-column source contract", () => {
  const table = { headers: SOURCE_COLUMNS.slice(0, -1), rows: [] };

  assert.throws(
    () => analyzeSourceTable(table),
    (error) =>
      error instanceof ImportValidationError &&
      error.issues.includes("Pflichtspalte fehlt: imdb_score."),
  );
});

test("prefers the new Supabase secret key and supports an equal legacy fallback", () => {
  assert.equal(
    resolveImportSecretKey({ secretKey: "sb_secret_example" }),
    "sb_secret_example",
  );
  assert.equal(
    resolveImportSecretKey({ legacyServiceRoleKey: "legacy-example" }),
    "legacy-example",
  );
  assert.equal(
    resolveImportSecretKey({
      secretKey: "same-value",
      legacyServiceRoleKey: "same-value",
    }),
    "same-value",
  );
});

test("rejects missing or ambiguous import secrets", () => {
  assert.throws(() => resolveImportSecretKey(), /SUPABASE_SECRET_KEY/);
  assert.throws(
    () =>
      resolveImportSecretKey({
        secretKey: "preferred",
        legacyServiceRoleKey: "different",
      }),
    /unterschiedliche Werte/,
  );
});
