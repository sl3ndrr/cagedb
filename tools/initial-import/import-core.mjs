// tools/initial-import/import-core.mjs
export const SOURCE_COLUMNS = Object.freeze([
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

export const IMPORT_COLUMNS = Object.freeze([
  "legacy_import_id",
  "release_year",
  "original_title",
  "german_title",
  "my_rating_percent",
  "rt_tomatometer_percent",
  "rt_audience_percent",
  "imdb_score",
]);

const SOURCE_COLUMN_SET = new Set(SOURCE_COLUMNS);
const STATUS_VALUES = new Set(["watched", "watchlist"]);

export class ImportValidationError extends Error {
  constructor(issues) {
    super(`Die Importquelle enthält ${issues.length} Validierungsfehler.`);
    this.name = "ImportValidationError";
    this.issues = [...issues];
  }
}

export function resolveImportSecretKey({
  secretKey,
  legacyServiceRoleKey,
} = {}) {
  const preferred = normalizeSecret(secretKey);
  const legacy = normalizeSecret(legacyServiceRoleKey);

  if (preferred && legacy && preferred !== legacy) {
    throw new Error(
      "SUPABASE_SECRET_KEY und SUPABASE_SERVICE_ROLE_KEY enthalten unterschiedliche Werte.",
    );
  }

  const resolved = preferred ?? legacy;
  if (!resolved || resolved.startsWith("YOUR_")) {
    throw new Error(
      "Die lokale Umgebungsvariable SUPABASE_SECRET_KEY fehlt (Legacy-Fallback: SUPABASE_SERVICE_ROLE_KEY).",
    );
  }

  return resolved;
}

export function parseCsv(csvText) {
  if (typeof csvText !== "string") {
    throw new TypeError("CSV input must be a string.");
  }

  const text = csvText.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      if (field.length > 0) {
        throw new ImportValidationError([
          "Ein CSV-Anführungszeichen steht innerhalb eines nicht zitierten Feldes.",
        ]);
      }
      inQuotes = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character === "\r") {
      if (text[index + 1] === "\n") {
        continue;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (inQuotes) {
    throw new ImportValidationError(["Ein zitiertes CSV-Feld wurde nicht geschlossen."]);
  }

  row.push(field);
  rows.push(row);

  const [headers = [], ...dataRows] = rows;
  return { headers, rows: dataRows };
}

export function analyzeSourceTable(table, { expectedCount = 109 } = {}) {
  if (!table || !Array.isArray(table.headers) || !Array.isArray(table.rows)) {
    throw new TypeError("Source table must contain header and row arrays.");
  }

  const issues = [];
  const headers = table.headers.map(normalizeHeader);
  const positions = new Map();

  headers.forEach((header, index) => {
    if (!positions.has(header)) {
      positions.set(header, []);
    }
    positions.get(header).push(index);
  });

  for (const column of SOURCE_COLUMNS) {
    const matches = positions.get(column) ?? [];
    if (matches.length === 0) {
      issues.push(`Pflichtspalte fehlt: ${column}.`);
    } else if (matches.length > 1) {
      issues.push(`Pflichtspalte ist mehrfach vorhanden: ${column}.`);
    }
  }

  if (issues.length > 0) {
    throw new ImportValidationError(issues);
  }

  const discardedColumnCount = headers.filter(
    (header) => !SOURCE_COLUMN_SET.has(header),
  ).length;
  const records = [];
  const conflicts = [];
  const seenIds = new Map();

  table.rows.forEach((sourceRow, rowIndex) => {
    const rowNumber = rowIndex + 2;
    const row = Array.isArray(sourceRow) ? sourceRow : [];
    const source = Object.fromEntries(
      SOURCE_COLUMNS.map((column) => [column, row[positions.get(column)[0]] ?? null]),
    );

    if (SOURCE_COLUMNS.every((column) => isBlank(source[column]))) {
      return;
    }

    const legacyImportId = parseRequiredText(source.id, "id", rowNumber, issues);
    const originalTitle = parseRequiredText(
      source.original_title,
      "original_title",
      rowNumber,
      issues,
    );
    const germanTitle = parseOptionalText(source.german_title);
    const releaseYear = parseOptionalNumber(
      source.release_year,
      "release_year",
      rowNumber,
      issues,
      { integer: true, min: 1888, max: 2200 },
    );
    const myRatingPercent = parseOptionalNumber(
      source.my_rating_percent,
      "my_rating_percent",
      rowNumber,
      issues,
      { integer: true, min: 0, max: 100 },
    );
    const rtTomatometerPercent = parseOptionalNumber(
      source.rt_tomatometer_percent,
      "rt_tomatometer_percent",
      rowNumber,
      issues,
      { integer: true, min: 0, max: 100 },
    );
    const rtAudiencePercent = parseOptionalNumber(
      source.rt_audience_percent,
      "rt_audience_percent",
      rowNumber,
      issues,
      { integer: true, min: 0, max: 100 },
    );
    const imdbScore = parseOptionalNumber(
      source.imdb_score,
      "imdb_score",
      rowNumber,
      issues,
      { min: 0, max: 10, maxDecimals: 1 },
    );
    const watched = parseOptionalBoolean(source.watched, rowNumber, issues);
    const status = parseOptionalStatus(source.status, rowNumber, issues);

    if (legacyImportId !== null) {
      const firstRow = seenIds.get(legacyImportId);
      if (firstRow !== undefined) {
        issues.push(
          `Zeile ${rowNumber}: id ist bereits in Zeile ${firstRow} vorhanden.`,
        );
      } else {
        seenIds.set(legacyImportId, rowNumber);
      }
    }

    const hasRating = myRatingPercent !== null;
    if (watched.valid && status.valid) {
      if (hasRating && (watched.value !== true || status.value !== "watched")) {
        conflicts.push({
          type: "rating_overrides_source_watchlist",
          rowNumber,
          legacyImportId,
          sourceWatched: watched.value,
          sourceStatus: status.value,
          resolvedWatched: true,
        });
      }

      if (!hasRating && (watched.value === true || status.value === "watched")) {
        conflicts.push({
          type: "source_watched_without_rating",
          rowNumber,
          legacyImportId,
          sourceWatched: watched.value,
          sourceStatus: status.value,
          resolvedWatched: false,
        });
      }
    }

    records.push({
      legacy_import_id: legacyImportId,
      release_year: releaseYear,
      original_title: originalTitle,
      german_title: germanTitle,
      my_rating_percent: myRatingPercent,
      rt_tomatometer_percent: rtTomatometerPercent,
      rt_audience_percent: rtAudiencePercent,
      imdb_score: imdbScore,
    });
  });

  if (Number.isInteger(expectedCount) && records.length !== expectedCount) {
    issues.push(
      `Erwartet wurden ${expectedCount} Datenzeilen; erkannt wurden ${records.length}.`,
    );
  }

  if (issues.length > 0) {
    throw new ImportValidationError(issues);
  }

  const ratedCount = records.filter(
    (record) => record.my_rating_percent !== null,
  ).length;
  const germanTitleFragmentCount = records.filter((record) =>
    /^[-–—]/u.test(record.german_title ?? ""),
  ).length;

  return Object.freeze({
    records: Object.freeze(records.map((record) => Object.freeze(record))),
    conflicts: Object.freeze(conflicts.map((conflict) => Object.freeze(conflict))),
    stats: Object.freeze({
      total: records.length,
      rated: ratedCount,
      watchlist: records.length - ratedCount,
      discardedColumnCount,
      recognizedColumnCount: SOURCE_COLUMNS.length,
      germanTitleMissing: countNull(records, "german_title"),
      germanTitleFragmentCount,
      rtTomatometerMissing: countNull(records, "rt_tomatometer_percent"),
      rtAudienceMissing: countNull(records, "rt_audience_percent"),
      imdbMissing: countNull(records, "imdb_score"),
      conflictRatingOverrides: conflicts.filter(
        (conflict) => conflict.type === "rating_overrides_source_watchlist",
      ).length,
      conflictMissingRating: conflicts.filter(
        (conflict) => conflict.type === "source_watched_without_rating",
      ).length,
    }),
  });
}

function normalizeHeader(value, index) {
  const text = value === null || value === undefined ? "" : String(value);
  return (index === 0 ? text.replace(/^\uFEFF/, "") : text).trim();
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function parseRequiredText(value, column, rowNumber, issues) {
  if (isBlank(value)) {
    issues.push(`Zeile ${rowNumber}: ${column} darf nicht leer sein.`);
    return null;
  }
  return String(value).trim();
}

function parseOptionalText(value) {
  return isBlank(value) ? null : String(value).trim();
}

function parseOptionalNumber(
  value,
  column,
  rowNumber,
  issues,
  { integer = false, min, max, maxDecimals } = {},
) {
  if (isBlank(value)) {
    return null;
  }

  const numericValue =
    typeof value === "number" ? value : Number(String(value).trim());

  if (!Number.isFinite(numericValue)) {
    issues.push(`Zeile ${rowNumber}: ${column} ist keine gültige Zahl.`);
    return null;
  }

  if (integer && !Number.isInteger(numericValue)) {
    issues.push(`Zeile ${rowNumber}: ${column} muss ganzzahlig sein.`);
  }

  if (min !== undefined && numericValue < min) {
    issues.push(`Zeile ${rowNumber}: ${column} liegt unter ${min}.`);
  }

  if (max !== undefined && numericValue > max) {
    issues.push(`Zeile ${rowNumber}: ${column} liegt über ${max}.`);
  }

  if (
    maxDecimals !== undefined &&
    !hasAtMostDecimals(numericValue, maxDecimals)
  ) {
    issues.push(
      `Zeile ${rowNumber}: ${column} darf höchstens ${maxDecimals} Nachkommastelle haben.`,
    );
  }

  return numericValue;
}

function parseOptionalBoolean(value, rowNumber, issues) {
  if (isBlank(value)) {
    return { value: null, valid: true };
  }

  if (typeof value === "boolean") {
    return { value, valid: true };
  }

  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "ja"].includes(normalized)) {
    return { value: true, valid: true };
  }
  if (["false", "0", "no", "nein"].includes(normalized)) {
    return { value: false, valid: true };
  }

  issues.push(`Zeile ${rowNumber}: watched ist kein gültiger Wahrheitswert.`);
  return { value: null, valid: false };
}

function parseOptionalStatus(value, rowNumber, issues) {
  if (isBlank(value)) {
    return { value: null, valid: true };
  }

  const normalized = String(value).trim().toLowerCase();
  if (!STATUS_VALUES.has(normalized)) {
    issues.push(`Zeile ${rowNumber}: status ist weder watched noch watchlist.`);
    return { value: null, valid: false };
  }

  return { value: normalized, valid: true };
}

function hasAtMostDecimals(value, decimalPlaces) {
  const multiplier = 10 ** decimalPlaces;
  return Math.abs(value * multiplier - Math.round(value * multiplier)) < 1e-9;
}

function countNull(records, key) {
  return records.filter((record) => record[key] === null).length;
}

function normalizeSecret(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
