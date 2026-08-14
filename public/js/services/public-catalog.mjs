// public/js/services/public-catalog.mjs
import { APP_CONFIG } from "../config.js";
import {
  DEFAULT_TIME_ZONE,
  calculateCatalogStats,
  normalizePublicFilms,
  selectFilmOfDay,
} from "../domain/home-catalog.mjs";
import { PublicConfigError, assertPublicConfig } from "./public-config.mjs";

export const PUBLIC_FILM_SELECT = [
  "id", "legacy_import_id", "release_year", "original_title", "german_title",
  "display_title", "my_rating_percent", "notes", "poster_path", "watchlist_priority",
].join(",");
export const PUBLIC_HOME_FILM_SELECT = PUBLIC_FILM_SELECT;
export const PUBLIC_HOME_METRIC_SELECT =
  "film_id,wig,scream_intensity,explosions,overacting_level";
export const PUBLIC_HOME_FILM_GENRE_SELECT = "film_id,genre_id";
export const PUBLIC_HOME_GENRE_SELECT = "id,name,slug,accent_color";
export const PUBLIC_TAG_SELECT = "id,name,slug,kind";
export const PUBLIC_FILM_TAG_SELECT = "film_id,tag_id";
export const PUBLIC_SCORE_SELECT = [
  "film_id", "provider", "rt_tomatometer_percent", "rt_audience_percent",
  "imdb_score", "source_url", "retrieved_at", "source_note",
].join(",");

export class PublicCatalogError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "PublicCatalogError";
    this.code = code;
  }
}

export async function loadPublicCatalog({
  client = null,
  config = APP_CONFIG,
  now = new Date(),
  timeZone = config?.timezone ?? DEFAULT_TIME_ZONE,
} = {}) {
  try {
    const publicConfig = assertPublicConfig(config);
    const database = client ?? (await import("./supabase-client.js")).supabase;
    const filmsResult = await database
      .from("films")
      .select(PUBLIC_FILM_SELECT)
      .eq("published", true)
      .order("legacy_import_id", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true });
    requireResult(filmsResult);

    const filmRows = arrayData(filmsResult);
    const filmIds = filmRows.map((film) => requiredId(film?.id));
    const generalQueries = [
      database.from("genres").select(PUBLIC_HOME_GENRE_SELECT)
        .eq("published", true).order("slug", { ascending: true }),
      database.from("tags").select(PUBLIC_TAG_SELECT)
        .eq("published", true).order("slug", { ascending: true }),
      database.from("editorial_content")
        .select("id,content_type,title,body,quote_attribution,event_date,event_year,sort_order,source_label,source_url")
        .eq("published", true).order("sort_order", { ascending: true })
        .order("event_date", { ascending: true, nullsFirst: false }),
      database.from("upcoming_releases")
        .select("id,original_title,german_title,display_title,role_name,expected_release_date,expected_release_window,status_label,notes,source_label,source_url,source_checked_at")
        .eq("published", true)
        .order("expected_release_date", { ascending: true, nullsFirst: false }),
      database.from("film_connections")
        .select("id,source_film_id,target_film_id,connection_type,description,source_label,source_url,source_checked_at")
        .eq("published", true).order("connection_type", { ascending: true }),
    ];
    const scopedQueries = filmIds.length ? [
      database.from("film_metrics").select(PUBLIC_HOME_METRIC_SELECT)
        .in("film_id", filmIds).order("film_id", { ascending: true }),
      database.from("film_genres").select(PUBLIC_HOME_FILM_GENRE_SELECT)
        .in("film_id", filmIds).order("film_id", { ascending: true })
        .order("genre_id", { ascending: true }),
      database.from("film_tags").select(PUBLIC_FILM_TAG_SELECT)
        .in("film_id", filmIds).order("film_id", { ascending: true })
        .order("tag_id", { ascending: true }),
      database.from("film_scores").select(PUBLIC_SCORE_SELECT)
        .in("film_id", filmIds).not("source_url", "is", null)
        .not("retrieved_at", "is", null).order("film_id", { ascending: true }),
    ] : [];

    const results = await Promise.all([...generalQueries, ...scopedQueries]);
    for (const result of results) requireResult(result);
    const [genresResult, tagsResult, editorialResult, upcomingResult, connectionsResult] = results;
    const [metricsResult, filmGenresResult, filmTagsResult, scoresResult] = filmIds.length
      ? results.slice(5)
      : [emptyResult(), emptyResult(), emptyResult(), emptyResult()];

    const genreRows = arrayData(genresResult);
    const tagRows = arrayData(tagsResult);
    const filmsWithGenres = attachLookupRows(
      filmRows, arrayData(filmGenresResult), genreRows, "genre_id", "film_genres", "genres",
    );
    let baseFilms;
    try {
      baseFilms = normalizePublicFilms(
        filmsWithGenres,
        arrayData(metricsResult),
        (path) => getPosterPublicUrl(database, config.posterBucket, path, publicConfig),
      );
    } catch {
      throw invalidDataError();
    }
    const films = attachFilmContent(
      baseFilms, arrayData(filmTagsResult), tagRows, arrayData(scoresResult),
    );
    const daily = selectFilmOfDay(films, { now, timeZone });
    const filmIdSet = new Set(filmIds);

    return deepFreeze({
      films,
      stats: calculateCatalogStats(films),
      dailyFilm: daily.film,
      dailyDateKey: daily.dateKey,
      dailyCandidateCount: daily.candidateCount,
      genres: genreRows.map(normalizeGenre),
      tags: tagRows.map(normalizeTag),
      editorialContent: arrayData(editorialResult).map(normalizeEditorial),
      upcomingReleases: arrayData(upcomingResult).map(normalizeUpcoming),
      connections: arrayData(connectionsResult)
        .filter((row) => filmIdSet.has(row?.source_film_id) && filmIdSet.has(row?.target_film_id))
        .map(normalizeConnection),
    });
  } catch (error) {
    if (error instanceof PublicCatalogError) throw error;
    if (error instanceof PublicConfigError) {
      throw new PublicCatalogError("configuration", error.message, { cause: error });
    }
    throw new PublicCatalogError(
      "network", "CageDB konnte die öffentliche Datenbank gerade nicht erreichen.", { cause: error },
    );
  }
}

export const loadPublicHomeCatalog = loadPublicCatalog;

function attachFilmContent(films, filmTagRows, tagRows, scoreRows) {
  const tagsById = new Map(tagRows.map((tag) => [requiredId(tag?.id), normalizeTag(tag)]));
  const tagsByFilm = new Map(films.map((film) => [film.id, []]));
  for (const relation of filmTagRows) {
    const filmTags = tagsByFilm.get(relation?.film_id);
    const tag = tagsById.get(relation?.tag_id);
    if (filmTags && tag) filmTags.push(tag);
  }
  const scoresByFilm = new Map(films.map((film) => [film.id, []]));
  for (const row of scoreRows) {
    const filmScores = scoresByFilm.get(row?.film_id);
    if (filmScores) filmScores.push(normalizeScore(row));
  }
  return films.map((film) => ({
    ...film,
    tags: (tagsByFilm.get(film.id) ?? []).sort((a, b) => a.slug.localeCompare(b.slug)),
    scores: (scoresByFilm.get(film.id) ?? []).sort((a, b) => a.provider.localeCompare(b.provider)),
  }));
}

function attachLookupRows(filmRows, relationRows, lookupRows, lookupKey, relationProperty, nestedProperty) {
  const lookup = new Map(lookupRows.map((row) => [requiredId(row?.id), row]));
  const byFilm = new Map(filmRows.map((row) => [requiredId(row?.id), []]));
  for (const relation of relationRows) {
    const target = byFilm.get(relation?.film_id);
    const item = lookup.get(relation?.[lookupKey]);
    if (target && item) target.push({ [nestedProperty]: item });
  }
  return filmRows.map((row) => ({ ...row, [relationProperty]: byFilm.get(row.id) ?? [] }));
}

function normalizeGenre(row) {
  return { id: requiredId(row?.id), name: requiredText(row?.name), slug: requiredText(row?.slug), accentColor: optionalColor(row?.accent_color) };
}

function normalizeTag(row) {
  return {
    id: requiredId(row?.id),
    name: requiredText(row?.name),
    slug: requiredText(row?.slug),
    kind: row?.kind === "running_gag" ? "running_gag" : "general",
  };
}

function normalizeScore(row) {
  if (!["imdb", "rotten_tomatoes"].includes(row?.provider)) throw invalidDataError();
  return {
    provider: row.provider,
    rtTomatometerPercent: nullableRange(row?.rt_tomatometer_percent, 0, 100),
    rtAudiencePercent: nullableRange(row?.rt_audience_percent, 0, 100),
    imdbScore: nullableRange(row?.imdb_score, 0, 10),
    sourceUrl: requiredHttpsUrl(row?.source_url),
    retrievedAt: requiredText(row?.retrieved_at),
    sourceNote: optionalText(row?.source_note),
  };
}

function normalizeEditorial(row) {
  return {
    id: requiredId(row?.id), contentType: requiredText(row?.content_type),
    title: optionalText(row?.title), body: requiredText(row?.body),
    quoteAttribution: optionalText(row?.quote_attribution), eventDate: optionalText(row?.event_date),
    eventYear: nullableRange(row?.event_year, 1800, 2200),
    sortOrder: nullableRange(row?.sort_order, -2147483648, 2147483647) ?? 0,
    sourceLabel: optionalText(row?.source_label), sourceUrl: optionalHttpsUrl(row?.source_url),
  };
}

function normalizeUpcoming(row) {
  return {
    id: requiredId(row?.id), originalTitle: requiredText(row?.original_title),
    germanTitle: optionalText(row?.german_title), displayTitle: requiredText(row?.display_title ?? row?.original_title),
    roleName: optionalText(row?.role_name), expectedReleaseDate: optionalText(row?.expected_release_date),
    expectedReleaseWindow: optionalText(row?.expected_release_window), statusLabel: optionalText(row?.status_label),
    notes: optionalText(row?.notes), sourceLabel: requiredText(row?.source_label),
    sourceUrl: optionalHttpsUrl(row?.source_url), sourceCheckedAt: requiredText(row?.source_checked_at),
  };
}

function normalizeConnection(row) {
  return {
    id: requiredId(row?.id), sourceFilmId: requiredId(row?.source_film_id),
    targetFilmId: requiredId(row?.target_film_id), connectionType: requiredText(row?.connection_type),
    description: optionalText(row?.description), sourceLabel: requiredText(row?.source_label),
    sourceUrl: optionalHttpsUrl(row?.source_url), sourceCheckedAt: optionalText(row?.source_checked_at),
  };
}

function getPosterPublicUrl(database, bucket, posterPath, publicConfig) {
  if (!bucket || !database?.storage?.from) return null;
  const publicUrl = database.storage.from(bucket).getPublicUrl(posterPath)?.data?.publicUrl;
  if (typeof publicUrl !== "string") return null;
  try {
    const parsed = new URL(publicUrl);
    const projectUrl = new URL(publicConfig.supabaseUrl);
    return parsed.protocol === projectUrl.protocol && parsed.host === projectUrl.host ? parsed.href : null;
  } catch { return null; }
}

function requireResult(result) {
  if (!result || result.error) {
    throw new PublicCatalogError("request", "Die veröffentlichten CageDB-Daten konnten nicht geladen werden.");
  }
}

function arrayData(result) {
  if (!Array.isArray(result?.data)) throw invalidDataError();
  return result.data;
}

function emptyResult() { return { data: [], error: null }; }
function requiredId(value) { return requiredText(value); }
function requiredText(value) {
  const text = optionalText(value);
  if (text === null) throw invalidDataError();
  return text;
}
function optionalText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}
function nullableRange(value, minimum, maximum) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) throw invalidDataError();
  return number;
}
function optionalColor(value) {
  const text = optionalText(value);
  if (text === null) return null;
  if (!/^#[0-9a-f]{6}$/i.test(text)) throw invalidDataError();
  return text.toLowerCase();
}
function optionalHttpsUrl(value) {
  const text = optionalText(value);
  return text === null ? null : requiredHttpsUrl(text);
}
function requiredHttpsUrl(value) {
  const text = requiredText(value);
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== "https:") throw invalidDataError();
    return parsed.href;
  } catch (error) {
    if (error instanceof PublicCatalogError) throw error;
    throw invalidDataError();
  }
}
function invalidDataError() {
  return new PublicCatalogError("invalid-data", "Die öffentliche Datenbankantwort entspricht nicht dem CageDB-Datenvertrag.");
}
function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
