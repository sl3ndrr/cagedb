// public/js/domain/catalog.mjs
const TEXT_COLLATOR = new Intl.Collator("de", {
  sensitivity: "base",
  numeric: true,
});

export const EMPTY_ARCHIVE_FILTERS = Object.freeze({
  query: "",
  year: "",
  decade: "",
  genre: "",
  status: "all",
  ratingMin: "",
  ratingMax: "",
  tag: "",
});

export function archiveFiltersFromQuery(query = {}) {
  const first = (value) => (Array.isArray(value) ? value[0] : value);
  const status = first(query.status);

  return Object.freeze({
    query: cleanText(first(query.q)) ?? "",
    year: validIntegerText(first(query.year), 1888, 2200),
    decade: validDecadeText(first(query.decade)),
    genre: cleanText(first(query.genre)) ?? "",
    status: ["all", "seen", "watchlist"].includes(status) ? status : "all",
    ratingMin: validIntegerText(first(query.ratingMin), 0, 100),
    ratingMax: validIntegerText(first(query.ratingMax), 0, 100),
    tag: cleanText(first(query.tag)) ?? "",
  });
}

export function filterFilms(films, rawFilters = EMPTY_ARCHIVE_FILTERS) {
  const filters = { ...EMPTY_ARCHIVE_FILTERS, ...rawFilters };
  const query = normalizeSearch(filters.query);
  const year = optionalNumber(filters.year);
  const decade = optionalNumber(filters.decade);
  const ratingMin = optionalNumber(filters.ratingMin);
  const ratingMax = optionalNumber(filters.ratingMax);

  return [...films]
    .filter((film) => {
      const searchable = normalizeSearch([
        film.displayTitle,
        film.originalTitle,
        film.germanTitle,
        film.legacyImportId,
      ].filter(Boolean).join(" "));
      const matchesQuery = !query || searchable.includes(query);
      const matchesYear = year === null || film.releaseYear === year;
      const matchesDecade =
        decade === null ||
        (film.releaseYear !== null && Math.floor(film.releaseYear / 10) * 10 === decade);
      const matchesStatus =
        filters.status === "all" ||
        (filters.status === "seen" && film.myRatingPercent !== null) ||
        (filters.status === "watchlist" && film.myRatingPercent === null);
      const matchesRatingMin =
        ratingMin === null ||
        (film.myRatingPercent !== null && film.myRatingPercent >= ratingMin);
      const matchesRatingMax =
        ratingMax === null ||
        (film.myRatingPercent !== null && film.myRatingPercent <= ratingMax);
      const matchesGenre =
        !filters.genre ||
        (filters.genre === "none"
          ? film.genres.length === 0
          : film.genres.some((genre) => genre.slug === filters.genre));
      const matchesTag =
        !filters.tag || film.tags.some((tag) => tag.slug === filters.tag);

      return (
        matchesQuery &&
        matchesYear &&
        matchesDecade &&
        matchesStatus &&
        matchesRatingMin &&
        matchesRatingMax &&
        matchesGenre &&
        matchesTag
      );
    })
    .sort(compareFilmsForArchive);
}

export function buildArchiveOptions(films, genres = [], tags = []) {
  const years = uniqueNumbers(films.map((film) => film.releaseYear)).sort((a, b) => b - a);
  const decades = uniqueNumbers(
    years.map((year) => Math.floor(year / 10) * 10),
  ).sort((a, b) => b - a);

  return Object.freeze({
    years: Object.freeze(years),
    decades: Object.freeze(decades),
    genres: Object.freeze([...genres].sort((a, b) => TEXT_COLLATOR.compare(a.name, b.name))),
    tags: Object.freeze([...tags].sort((a, b) => TEXT_COLLATOR.compare(a.name, b.name))),
    hasGenreGap: films.some((film) => film.genres.length === 0),
  });
}

export function calculatePublicStatistics(films) {
  const seen = films.filter((film) => film.myRatingPercent !== null);
  const watchlist = films.filter((film) => film.myRatingPercent === null);
  const decadeCounts = countBy(
    films,
    (film) =>
      film.releaseYear === null
        ? "Jahr unbekannt"
        : `${Math.floor(film.releaseYear / 10) * 10}er`,
  );
  const genreCounts = new Map();

  for (const film of films) {
    const filmGenres = film.genres.length ? film.genres : [{ slug: "none", name: "Ohne Genre" }];
    for (const genre of filmGenres) {
      const existing = genreCounts.get(genre.slug) ?? {
        key: genre.slug,
        label: genre.name,
        value: 0,
        accentColor: genre.accentColor ?? null,
      };
      existing.value += 1;
      genreCounts.set(genre.slug, existing);
    }
  }

  const rankedHigh = [...seen].sort(compareRatingDescending);
  const rankedLow = [...seen].sort(compareRatingAscending);
  const runningGags = countTags(films, "running_gag");

  return deepFreeze({
    total: films.length,
    seen: seen.length,
    watchlist: watchlist.length,
    progressPercent: films.length ? round((seen.length / films.length) * 100) : 0,
    decades: mapCounts(decadeCounts, compareDecadeLabels),
    genres: [...genreCounts.values()].sort(
      (a, b) => b.value - a.value || TEXT_COLLATOR.compare(a.label, b.label),
    ),
    top: rankedHigh.slice(0, 10),
    flop: rankedLow.slice(0, 10),
    runningGags,
  });
}

export function selectWatchlistFilm(films, randomValue = Math.random()) {
  const candidates = films
    .filter((film) => film.myRatingPercent === null)
    .sort((left, right) => {
      const leftPriority = left.watchlistPriority ?? Number.MAX_SAFE_INTEGER;
      const rightPriority = right.watchlistPriority ?? Number.MAX_SAFE_INTEGER;
      return leftPriority - rightPriority || compareFilmsForArchive(left, right);
    });

  if (candidates.length === 0) {
    return null;
  }

  const normalizedRandom = Number.isFinite(randomValue)
    ? Math.min(Math.max(randomValue, 0), 0.999999999999)
    : 0;
  return candidates[Math.floor(normalizedRandom * candidates.length)];
}

export function secureRandomFraction(cryptoRef = globalThis.crypto) {
  if (!cryptoRef?.getRandomValues) {
    return Math.random();
  }
  const value = new Uint32Array(1);
  cryptoRef.getRandomValues(value);
  return value[0] / 0x100000000;
}

export function findFilmById(films, id) {
  return films.find((film) => film.id === id) ?? null;
}

function countTags(films, kind) {
  const counts = new Map();
  for (const film of films) {
    for (const tag of film.tags.filter((item) => item.kind === kind)) {
      const existing = counts.get(tag.slug) ?? {
        key: tag.slug,
        label: tag.name,
        value: 0,
      };
      existing.value += 1;
      counts.set(tag.slug, existing);
    }
  }
  return [...counts.values()].sort(
    (a, b) => b.value - a.value || TEXT_COLLATOR.compare(a.label, b.label),
  );
}

function countBy(items, keyForItem) {
  const counts = new Map();
  for (const item of items) {
    const key = keyForItem(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function mapCounts(counts, comparator) {
  return [...counts.entries()]
    .map(([label, value]) => ({ key: label, label, value }))
    .sort((a, b) => comparator(a.label, b.label));
}

function compareDecadeLabels(left, right) {
  if (left === "Jahr unbekannt") return 1;
  if (right === "Jahr unbekannt") return -1;
  return Number.parseInt(left, 10) - Number.parseInt(right, 10);
}

function compareFilmsForArchive(left, right) {
  const leftYear = left.releaseYear ?? Number.MAX_SAFE_INTEGER;
  const rightYear = right.releaseYear ?? Number.MAX_SAFE_INTEGER;
  return leftYear - rightYear || TEXT_COLLATOR.compare(left.displayTitle, right.displayTitle);
}

function compareRatingDescending(left, right) {
  return (
    right.myRatingPercent - left.myRatingPercent ||
    TEXT_COLLATOR.compare(left.displayTitle, right.displayTitle)
  );
}

function compareRatingAscending(left, right) {
  return (
    left.myRatingPercent - right.myRatingPercent ||
    TEXT_COLLATOR.compare(left.displayTitle, right.displayTitle)
  );
}

function normalizeSearch(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de")
    .trim();
}

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function optionalNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validIntegerText(value, minimum, maximum) {
  const text = cleanText(value);
  if (text === null) return "";
  const number = Number(text);
  return Number.isInteger(number) && number >= minimum && number <= maximum
    ? String(number)
    : "";
}

function validDecadeText(value) {
  const text = validIntegerText(value, 1880, 2200);
  return text && Number(text) % 10 === 0 ? text : "";
}

function uniqueNumbers(values) {
  return [...new Set(values.filter((value) => Number.isFinite(value)))];
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
