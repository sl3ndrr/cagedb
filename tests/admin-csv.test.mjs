// tests/admin-csv.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKUP_COLUMNS,
  CsvValidationError,
  createBackupCsv,
  parseCorrectionCsv,
} from "../public/js/domain/admin-csv.mjs";

const headers = "id,release_year,original_title,german_title,my_rating_percent,watched,status,rt_tomatometer_percent,rt_audience_percent,imdb_score";

test("previews both rating/status conflict rules without storing source status", () => {
  const preview = parseCorrectionCsv(`${headers}\n1,2000,A,,80,false,watchlist,,,\n2,2001,B,,,true,watched,,,\n`);
  assert.equal(preview.rows.length, 2);
  assert.equal(preview.conflicts.length, 2);
  assert.equal(preview.conflicts[0].type, "rating_overrides_source_watchlist");
  assert.equal(preview.conflicts[1].type, "source_watched_without_rating");
  assert.deepEqual(Object.keys(preview.rows[0]), [
    "legacy_import_id", "release_year", "original_title", "german_title", "my_rating_percent",
  ]);
});

test("discards unknown CSV columns without returning their names or values", () => {
  const preview = parseCorrectionCsv(`${headers},private_note\n1,2000,A,,80,true,watched,,,,do-not-return\n`);
  const serialized = JSON.stringify(preview);
  assert.equal(preview.stats.ignoredColumnCount, 1);
  assert.equal(serialized.includes("private_note"), false);
  assert.equal(serialized.includes("do-not-return"), false);
});

test("counts but never applies external scores in correction rows", () => {
  const preview = parseCorrectionCsv(`${headers}\n1,2000,A,,80,true,watched,70,60,6.5\n`);
  assert.equal(preview.stats.externalScoreRows, 1);
  assert.equal("imdb_score" in preview.rows[0], false);
  assert.equal("rt_tomatometer_percent" in preview.rows[0], false);
});

test("rejects duplicate IDs and malformed source contracts", () => {
  assert.throws(
    () => parseCorrectionCsv(`${headers}\n1,2000,A,,80,true,watched,,,\n1,2001,B,,70,true,watched,,,\n`),
    CsvValidationError,
  );
  assert.throws(() => parseCorrectionCsv("id,original_title\n1,A\n"), CsvValidationError);
});

test("exports only the fixed backup schema and neutralizes spreadsheet formulas", () => {
  const csv = createBackupCsv({
    films: [{
      id: "f1", legacy_import_id: "1", release_year: 2000, original_title: "=CMD()",
      german_title: null, my_rating_percent: 0, notes: null, watchlist_priority: null,
      published: true, poster_path: null,
    }],
    genres: [], filmGenres: [], tags: [], filmTags: [], metrics: [], scores: [],
  });
  assert.ok(csv.startsWith("\uFEFF"));
  assert.equal(csv.includes("'=CMD()"), true);
  const firstLine = csv.replace(/^\uFEFF/, "").split("\r\n")[0];
  assert.equal(firstLine.split(",").length, BACKUP_COLUMNS.length);
  assert.equal(csv.includes("undefined"), false);
});
