// public/js/domain/admin-csv.mjs
export const CORRECTION_SOURCE_COLUMNS = Object.freeze([
  "id",
  "release_year",
  "original_title",
  "german_title",
  "my_rating_percent",
  "watched",
  "status",
  "rt_tomatometer_percent",
  "rt_audience_percent",
  "imdb_score",
]);

export const BACKUP_COLUMNS = Object.freeze([
  "film_uuid",
  "legacy_import_id",
  "release_year",
  "original_title",
  "german_title",
  "my_rating_percent",
  "watched_derived",
  "notes",
  "watchlist_priority",
  "published",
  "poster_path",
  "genres",
  "tags",
  "metric_wig_0_5",
  "metric_scream_0_5",
  "metric_explosions_0_5",
  "metric_overacting_0_5",
  "rt_tomatometer_percent",
  "rt_audience_percent",
  "rt_source_url",
  "rt_retrieved_at",
  "imdb_score",
  "imdb_source_url",
  "imdb_retrieved_at",
]);

const COLUMN_SET = new Set(CORRECTION_SOURCE_COLUMNS);
const STATUS_VALUES = new Set(["watched", "watchlist"]);

export class CsvValidationError extends Error {
  constructor(issues) {
    super(`Die CSV enthält ${issues.length} Validierungsfehler.`);
    this.name = "CsvValidationError";
    this.issues = Object.freeze([...issues]);
  }
}

export function parseCorrectionCsv(csvText) {
  const table = parseCsv(csvText);
  return analyzeCorrectionTable(table);
}

export function analyzeCorrectionTable(table) {
  if (!table || !Array.isArray(table.headers) || !Array.isArray(table.rows)) {
    throw new TypeError("CSV table must contain headers and rows.");
  }

  const issues = [];
  const headers = table.headers.map((header, index) => normalizeHeader(header, index));
  const positions = new Map();
  headers.forEach((header, index) => {
    const indexes = positions.get(header) ?? [];
    indexes.push(index);
    positions.set(header, indexes);
  });

  for (const column of CORRECTION_SOURCE_COLUMNS) {
    const matches = positions.get(column) ?? [];
    if (matches.length === 0) issues.push(`Pflichtspalte fehlt: ${column}.`);
    if (matches.length > 1) issues.push(`Pflichtspalte ist mehrfach vorhanden: ${column}.`);
  }
  if (issues.length) throw new CsvValidationError(issues);

  const rows = [];
  const conflicts = [];
  const seenIds = new Map();
  let externalScoreRows = 0;

  table.rows.forEach((inputRow, index) => {
    const rowNumber = index + 2;
    const source = Object.fromEntries(
      CORRECTION_SOURCE_COLUMNS.map((column) => [
        column,
        inputRow?.[positions.get(column)[0]] ?? null,
      ]),
    );

    if (CORRECTION_SOURCE_COLUMNS.every((column) => isBlank(source[column]))) return;

    const legacyImportId = requiredText(source.id, "id", rowNumber, issues);
    const originalTitle = requiredText(
      source.original_title,
      "original_title",
      rowNumber,
      issues,
    );
    const releaseYear = numberValue(source.release_year, "release_year", rowNumber, issues, {
      integer: true,
      minimum: 1888,
      maximum: 2200,
    });
    const rating = numberValue(
      source.my_rating_percent,
      "my_rating_percent",
      rowNumber,
      issues,
      { integer: true, minimum: 0, maximum: 100 },
    );
    const watched = booleanValue(source.watched, rowNumber, issues);
    const status = statusValue(source.status, rowNumber, issues);
    const rtCritics = numberValue(
      source.rt_tomatometer_percent,
      "rt_tomatometer_percent",
      rowNumber,
      issues,
      { integer: true, minimum: 0, maximum: 100 },
    );
    const rtAudience = numberValue(
      source.rt_audience_percent,
      "rt_audience_percent",
      rowNumber,
      issues,
      { integer: true, minimum: 0, maximum: 100 },
    );
    const imdb = numberValue(source.imdb_score, "imdb_score", rowNumber, issues, {
      minimum: 0,
      maximum: 10,
      decimalPlaces: 1,
    });

    if (legacyImportId !== null) {
      if (seenIds.has(legacyImportId)) {
        issues.push(
          `Zeile ${rowNumber}: id wurde bereits in Zeile ${seenIds.get(legacyImportId)} verwendet.`,
        );
      } else {
        seenIds.set(legacyImportId, rowNumber);
      }
    }

    if (rating !== null && (watched !== true || status !== "watched")) {
      conflicts.push({
        type: "rating_overrides_source_watchlist",
        rowNumber,
        legacyImportId,
        resolution: "Bewertung vorhanden: Der Film gilt als gesehen.",
      });
    }
    if (rating === null && (watched === true || status === "watched")) {
      conflicts.push({
        type: "source_watched_without_rating",
        rowNumber,
        legacyImportId,
        resolution: "Bewertung fehlt: Der Film bleibt auf der Watchlist.",
      });
    }

    if (rtCritics !== null || rtAudience !== null || imdb !== null) externalScoreRows += 1;

    rows.push({
      legacy_import_id: legacyImportId,
      release_year: releaseYear,
      original_title: originalTitle,
      german_title: optionalText(source.german_title),
      my_rating_percent: rating,
    });
  });

  if (issues.length) throw new CsvValidationError(issues);

  return deepFreeze({
    rows,
    conflicts,
    stats: {
      total: rows.length,
      rated: rows.filter((row) => row.my_rating_percent !== null).length,
      watchlist: rows.filter((row) => row.my_rating_percent === null).length,
      ignoredColumnCount: headers.filter((header) => !COLUMN_SET.has(header)).length,
      externalScoreRows,
    },
  });
}

export function createBackupCsv(data) {
  const genreById = new Map(data.genres.map((row) => [row.id, row]));
  const tagById = new Map(data.tags.map((row) => [row.id, row]));
  const genresByFilm = collectRelations(data.filmGenres, "genre_id", genreById);
  const tagsByFilm = collectRelations(data.filmTags, "tag_id", tagById);
  const metricsByFilm = new Map(data.metrics.map((row) => [row.film_id, row]));
  const scoresByFilm = new Map();

  for (const score of data.scores) {
    const filmScores = scoresByFilm.get(score.film_id) ?? {};
    filmScores[score.provider] = score;
    scoresByFilm.set(score.film_id, filmScores);
  }

  const records = [...data.films]
    .sort((a, b) => String(a.legacy_import_id ?? a.id).localeCompare(String(b.legacy_import_id ?? b.id), "de", { numeric: true }))
    .map((film) => {
      const metrics = metricsByFilm.get(film.id) ?? {};
      const scores = scoresByFilm.get(film.id) ?? {};
      const rt = scores.rotten_tomatoes ?? {};
      const imdb = scores.imdb ?? {};
      return {
        film_uuid: film.id,
        legacy_import_id: film.legacy_import_id,
        release_year: film.release_year,
        original_title: film.original_title,
        german_title: film.german_title,
        my_rating_percent: film.my_rating_percent,
        watched_derived: film.my_rating_percent !== null,
        notes: film.notes,
        watchlist_priority: film.watchlist_priority,
        published: film.published,
        poster_path: film.poster_path,
        genres: (genresByFilm.get(film.id) ?? []).map((item) => item.name).join(" | "),
        tags: (tagsByFilm.get(film.id) ?? []).map((item) => `${item.kind}:${item.name}`).join(" | "),
        metric_wig_0_5: metrics.wig,
        metric_scream_0_5: metrics.scream_intensity,
        metric_explosions_0_5: metrics.explosions,
        metric_overacting_0_5: metrics.overacting_level,
        rt_tomatometer_percent: rt.rt_tomatometer_percent,
        rt_audience_percent: rt.rt_audience_percent,
        rt_source_url: rt.source_url,
        rt_retrieved_at: rt.retrieved_at,
        imdb_score: imdb.imdb_score,
        imdb_source_url: imdb.source_url,
        imdb_retrieved_at: imdb.retrieved_at,
      };
    });

  const lines = [BACKUP_COLUMNS.map(csvCell).join(",")];
  for (const record of records) {
    lines.push(BACKUP_COLUMNS.map((column) => csvCell(record[column])).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function parseCsv(csvText) {
  if (typeof csvText !== "string") throw new TypeError("CSV input must be text.");
  const text = csvText.replace(/^\uFEFF/, "");
  const records = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      if (field) throw new CsvValidationError(["Ungültiges Anführungszeichen in einem CSV-Feld."]);
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      records.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new CsvValidationError(["Ein zitiertes CSV-Feld wurde nicht geschlossen."]);
  if (field || row.length) {
    row.push(field);
    records.push(row);
  }
  const [headers = [], ...rows] = records;
  return { headers, rows };
}

function collectRelations(relations, lookupKey, lookup) {
  const result = new Map();
  for (const relation of relations) {
    const item = lookup.get(relation[lookupKey]);
    if (!item) continue;
    const current = result.get(relation.film_id) ?? [];
    current.push(item);
    result.set(relation.film_id, current);
  }
  return result;
}

function normalizeHeader(value, index) {
  const text = String(value ?? "").trim();
  return index === 0 ? text.replace(/^\uFEFF/, "") : text;
}

function requiredText(value, column, rowNumber, issues) {
  const text = optionalText(value);
  if (text === null) issues.push(`Zeile ${rowNumber}: ${column} darf nicht leer sein.`);
  return text;
}

function optionalText(value) {
  if (isBlank(value)) return null;
  return String(value).trim();
}

function numberValue(value, column, rowNumber, issues, options) {
  if (isBlank(value)) return null;
  const number = Number(String(value).trim());
  if (!Number.isFinite(number)) {
    issues.push(`Zeile ${rowNumber}: ${column} ist keine gültige Zahl.`);
    return null;
  }
  if (options.integer && !Number.isInteger(number)) {
    issues.push(`Zeile ${rowNumber}: ${column} muss ganzzahlig sein.`);
  }
  if (number < options.minimum || number > options.maximum) {
    issues.push(`Zeile ${rowNumber}: ${column} liegt außerhalb ${options.minimum}–${options.maximum}.`);
  }
  if (options.decimalPlaces !== undefined) {
    const factor = 10 ** options.decimalPlaces;
    if (Math.abs(number * factor - Math.round(number * factor)) > 1e-9) {
      issues.push(`Zeile ${rowNumber}: ${column} hat zu viele Nachkommastellen.`);
    }
  }
  return number;
}

function booleanValue(value, rowNumber, issues) {
  if (isBlank(value)) return null;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "ja"].includes(normalized)) return true;
  if (["false", "0", "no", "nein"].includes(normalized)) return false;
  issues.push(`Zeile ${rowNumber}: watched ist kein gültiger Wahrheitswert.`);
  return null;
}

function statusValue(value, rowNumber, issues) {
  if (isBlank(value)) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!STATUS_VALUES.has(normalized)) {
    issues.push(`Zeile ${rowNumber}: status ist weder watched noch watchlist.`);
    return null;
  }
  return normalized;
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
