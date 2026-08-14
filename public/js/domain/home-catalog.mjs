// public/js/domain/home-catalog.mjs
export const DEFAULT_TIME_ZONE = "Europe/Berlin";

export const CAGE_METRICS = Object.freeze([
  Object.freeze({ key: "wig", label: "Perücke" }),
  Object.freeze({ key: "screamIntensity", label: "Schrei" }),
  Object.freeze({ key: "explosions", label: "Explosionen" }),
  Object.freeze({ key: "overactingLevel", label: "Overacting" }),
]);

const DATABASE_METRIC_KEYS = Object.freeze({
  wig: "wig",
  screamIntensity: "scream_intensity",
  explosions: "explosions",
  overactingLevel: "overacting_level",
});
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function buildHomeCatalog(
  { filmRows = [], metricRows = [] } = {},
  {
    now = new Date(),
    timeZone = DEFAULT_TIME_ZONE,
    posterUrlForPath = () => null,
  } = {},
) {
  const films = normalizePublicFilms(filmRows, metricRows, posterUrlForPath);
  const stats = calculateCatalogStats(films);
  const daily = selectFilmOfDay(films, { now, timeZone });

  return deepFreeze({
    films,
    stats,
    dailyFilm: daily.film,
    dailyDateKey: daily.dateKey,
    dailyCandidateCount: daily.candidateCount,
  });
}

export function normalizePublicFilms(
  filmRows,
  metricRows = [],
  posterUrlForPath = () => null,
) {
  if (!Array.isArray(filmRows) || !Array.isArray(metricRows)) {
    throw new TypeError("Public catalog rows must be arrays.");
  }

  if (typeof posterUrlForPath !== "function") {
    throw new TypeError("posterUrlForPath must be a function.");
  }

  const metricsByFilmId = new Map();
  for (const row of metricRows) {
    const filmId = requiredText(row?.film_id, "film_metrics.film_id");
    metricsByFilmId.set(filmId, normalizeMetrics(row));
  }

  const films = filmRows.map((row) => {
    const id = requiredText(row?.id, "films.id");
    const originalTitle = requiredText(row?.original_title, "films.original_title");
    const germanTitle = optionalText(row?.german_title);
    const displayTitle =
      optionalText(row?.display_title) ?? composeDisplayTitle(originalTitle, germanTitle);
    const rating = nullableNumber(row?.my_rating_percent, {
      label: "films.my_rating_percent",
      min: 0,
      max: 100,
      integer: true,
    });
    const posterPath = optionalText(row?.poster_path);

    return {
      id,
      legacyImportId: optionalText(row?.legacy_import_id),
      releaseYear: nullableNumber(row?.release_year, {
        label: "films.release_year",
        min: 1888,
        max: 2200,
        integer: true,
      }),
      originalTitle,
      germanTitle,
      displayTitle,
      myRatingPercent: rating,
      watched: rating !== null,
      notes: optionalText(row?.notes),
      watchlistPriority: nullableNumber(row?.watchlist_priority, {
        label: "films.watchlist_priority",
        min: 1,
        max: Number.MAX_SAFE_INTEGER,
        integer: true,
      }),
      posterPath,
      posterUrl: posterPath ? optionalPublicUrl(posterUrlForPath(posterPath)) : null,
      genres: normalizeGenres(row?.film_genres),
      metrics: metricsByFilmId.get(id) ?? emptyMetrics(),
    };
  });

  return deepFreeze(stableSortFilms(films));
}

export function calculateCatalogStats(films) {
  if (!Array.isArray(films)) {
    throw new TypeError("Films must be an array.");
  }

  const ratings = films
    .map((film) => film.myRatingPercent)
    .filter((rating) => rating !== null);
  const seen = ratings.length;
  const metricAverages = {};
  const allMetricValues = [];
  let assessedFilms = 0;

  for (const definition of CAGE_METRICS) {
    const values = films
      .map((film) => film.metrics?.[definition.key] ?? null)
      .filter((value) => value !== null);
    metricAverages[definition.key] = average(values);
    allMetricValues.push(...values);
  }

  for (const film of films) {
    if (CAGE_METRICS.some(({ key }) => film.metrics?.[key] !== null)) {
      assessedFilms += 1;
    }
  }

  return deepFreeze({
    total: films.length,
    seen,
    watchlist: films.length - seen,
    averageRating: average(ratings),
    cageOMeter: {
      overall: average(allMetricValues),
      assessedFilms,
      metrics: metricAverages,
    },
  });
}

export function selectFilmOfDay(
  films,
  { now = new Date(), timeZone = DEFAULT_TIME_ZONE } = {},
) {
  if (!Array.isArray(films)) {
    throw new TypeError("Films must be an array.");
  }

  const dateKey = getZonedDateKey(now, timeZone);
  const candidates = stableSortFilms(
    films.filter((film) => film.myRatingPercent === null),
  );

  if (candidates.length === 0) {
    return deepFreeze({ film: null, dateKey, candidateCount: 0, index: null });
  }

  const roster = candidates.map(stableFilmKey);
  const seed = `${dateKey}|${timeZone}|${JSON.stringify(roster)}`;
  const index = fnv1a(seed) % candidates.length;

  return deepFreeze({
    film: candidates[index],
    dateKey,
    candidateCount: candidates.length,
    index,
  });
}

export function getZonedDateKey(now, timeZone = DEFAULT_TIME_ZONE) {
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("The film-of-the-day date is invalid.");
  }

  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

export function stableSortFilms(films) {
  return [...films].sort((left, right) =>
    compareCodeUnits(stableFilmKey(left), stableFilmKey(right)),
  );
}

function stableFilmKey(film) {
  const id = requiredText(film?.id, "film.id");
  const legacyImportId = optionalText(film?.legacyImportId);
  return `${legacyImportId === null ? "1" : "0"}:${legacyImportId ?? id}|${id}`;
}

function normalizeMetrics(row) {
  const metrics = {};

  for (const [domainKey, databaseKey] of Object.entries(DATABASE_METRIC_KEYS)) {
    metrics[domainKey] = nullableNumber(row?.[databaseKey], {
      label: `film_metrics.${databaseKey}`,
      min: 0,
      max: 5,
      integer: true,
    });
  }

  return metrics;
}

function emptyMetrics() {
  return Object.fromEntries(CAGE_METRICS.map(({ key }) => [key, null]));
}

function normalizeGenres(relations) {
  if (relations === null || relations === undefined) {
    return [];
  }
  if (!Array.isArray(relations)) {
    throw new TypeError("films.film_genres must be an array.");
  }

  return relations
    .flatMap((relation) => {
      const value = relation?.genres;
      return Array.isArray(value) ? value : value ? [value] : [];
    })
    .map((genre) => ({
      name: requiredText(genre?.name, "genres.name"),
      slug: requiredText(genre?.slug, "genres.slug"),
      accentColor: optionalHexColor(genre?.accent_color),
    }))
    .sort((left, right) => compareCodeUnits(left.slug, right.slug));
}

function composeDisplayTitle(originalTitle, germanTitle) {
  if (germanTitle === null) {
    return originalTitle;
  }
  if (/^[-–—]/u.test(germanTitle)) {
    return `${originalTitle} ${germanTitle}`;
  }
  return germanTitle;
}

function nullableNumber(value, { label, min, max, integer = false }) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = typeof value === "number" ? value : Number(value);
  if (
    !Number.isFinite(number) ||
    (integer && !Number.isInteger(number)) ||
    number < min ||
    number > max
  ) {
    throw new TypeError(`${label} violates the public data contract.`);
  }
  return number;
}

function requiredText(value, label) {
  const text = optionalText(value);
  if (text === null) {
    throw new TypeError(`${label} must not be blank.`);
  }
  return text;
}

function optionalText(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text === "" ? null : text;
}

function optionalHexColor(value) {
  const text = optionalText(value);
  if (text === null) {
    return null;
  }
  if (!/^#[0-9a-f]{6}$/iu.test(text)) {
    throw new TypeError("genres.accent_color violates the public data contract.");
  }
  return text.toLowerCase();
}

function optionalPublicUrl(value) {
  const text = optionalText(value);
  if (text === null) {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return null;
  }
  const localHttp = parsed.protocol === "http:" && LOCAL_HOSTS.has(parsed.hostname);
  return parsed.protocol === "https:" || localHttp ? parsed.href : null;
}

function average(values) {
  if (values.length === 0) {
    return null;
  }
  const result = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.round((result + Number.EPSILON) * 10) / 10;
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const nested of Object.values(value)) {
    deepFreeze(nested, seen);
  }
  return Object.freeze(value);
}
