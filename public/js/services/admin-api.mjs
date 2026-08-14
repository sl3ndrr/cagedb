// public/js/services/admin-api.mjs
import { APP_CONFIG } from "../config.js";
import { assertPublicConfig } from "./public-config.mjs";

const EDITABLE_TABLES = new Set([
  "genres", "tags", "editorial_content", "upcoming_releases", "film_connections",
]);
const POSTER_TYPES = new Map([
  ["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"], ["image/avif", "avif"],
]);

export class AdminApiError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "AdminApiError";
    this.code = code;
  }
}

export async function resolveAdminAccess({ client = null } = {}) {
  const database = await clientFor(client);
  const sessionResult = await database.auth.getSession();
  if (sessionResult.error) throw apiError("auth", "Die Sitzung konnte nicht geprüft werden.");
  const session = sessionResult.data?.session ?? null;
  if (!session) return Object.freeze({ status: "anonymous", session: null });

  const userResult = await database.auth.getUser();
  if (userResult.error || !userResult.data?.user) {
    await database.auth.signOut({ scope: "local" });
    return Object.freeze({ status: "anonymous", session: null });
  }
  const adminResult = await database.rpc("is_admin");
  if (adminResult.error) throw apiError("authorization", "Die Adminfreigabe konnte nicht geprüft werden.");
  if (adminResult.data !== true) {
    return Object.freeze({ status: "forbidden", session });
  }
  return Object.freeze({ status: "authorized", session });
}

export async function signInWithPassword(email, password, { client = null } = {}) {
  const database = await clientFor(client);
  const result = await database.auth.signInWithPassword({ email, password });
  if (result.error) throw apiError("credentials", "E-Mail oder Passwort ist nicht korrekt.");
  return result.data?.session ?? null;
}

export async function signOut({ client = null } = {}) {
  const database = await clientFor(client);
  const result = await database.auth.signOut({ scope: "local" });
  if (result.error) throw apiError("auth", "Die Abmeldung ist fehlgeschlagen.");
}

export async function subscribeToAuthChanges(listener, { client = null } = {}) {
  const database = await clientFor(client);
  const { data } = database.auth.onAuthStateChange((_event, session) => listener(session));
  return () => data?.subscription?.unsubscribe();
}

export async function loadAdminData({ client = null, config = APP_CONFIG } = {}) {
  const database = await clientFor(client);
  const definitions = [
    ["films", "*", "release_year", false],
    ["genres", "*", "name", true],
    ["film_genres", "*", "film_id", true],
    ["film_metrics", "*", "film_id", true],
    ["tags", "*", "name", true],
    ["film_tags", "*", "film_id", true],
    ["film_scores", "*", "film_id", true],
    ["editorial_content", "*", "sort_order", true],
    ["upcoming_releases", "*", "expected_release_date", true],
    ["film_connections", "*", "connection_type", true],
  ];
  const results = await Promise.all(
    definitions.map(([table, select, column, ascending]) =>
      database.from(table).select(select).order(column, { ascending, nullsFirst: false }),
    ),
  );
  results.forEach((result) => ensureResult(result, "Daten konnten nicht geladen werden."));
  const [films, genres, filmGenres, metrics, tags, filmTags, scores, editorial, upcoming, connections] =
    results.map((result) => result.data ?? []);
  const publicConfig = assertPublicConfig(config);
  const posterBucket = config.posterBucket;
  const filmsWithPosters = films.map((film) => ({
    ...film,
    poster_public_url: film.poster_path
      ? validatedPosterUrl(database, posterBucket, film.poster_path, publicConfig.supabaseUrl)
      : null,
  }));

  return deepFreeze({
    films: filmsWithPosters,
    genres,
    filmGenres,
    metrics,
    tags,
    filmTags,
    scores,
    editorial,
    upcoming,
    connections,
  });
}

export async function saveFilmBundle(bundle, { client = null } = {}) {
  const database = await clientFor(client);
  const film = pick(bundle.film, [
    "legacy_import_id", "release_year", "original_title", "german_title",
    "my_rating_percent", "notes", "watchlist_priority", "published",
  ]);
  let filmId = cleanText(bundle.film?.id);
  let result;
  if (filmId) {
    result = await database.from("films").update(film).eq("id", filmId).select("id").single();
  } else {
    result = await database.from("films").insert(film).select("id").single();
  }
  ensureResult(result, "Der Film konnte nicht gespeichert werden.");
  filmId = result.data?.id;
  if (!filmId) throw apiError("invalid-response", "Die Film-ID fehlt in der Datenbankantwort.");

  await replaceRelations(database, "film_genres", "genre_id", filmId, bundle.genreIds ?? []);
  await replaceRelations(database, "film_tags", "tag_id", filmId, bundle.tagIds ?? []);
  await saveMetrics(database, filmId, bundle.metrics ?? {});
  await saveScores(database, filmId, bundle.scores ?? {});
  return filmId;
}

export async function deleteFilm(filmId, { client = null } = {}) {
  const database = await clientFor(client);
  const result = await database.from("films").delete().eq("id", filmId);
  ensureResult(result, "Der Film konnte nicht gelöscht werden.");
}

export async function saveLookup(table, record, { client = null } = {}) {
  if (!new Set(["genres", "tags"]).has(table)) throw new TypeError("Unsupported lookup table.");
  const database = await clientFor(client);
  const allowed = table === "genres"
    ? ["name", "slug", "accent_color", "published"]
    : ["name", "slug", "kind", "published"];
  const payload = pick(record, allowed);
  const id = cleanText(record.id);
  const query = id
    ? database.from(table).update(payload).eq("id", id).select("id").single()
    : database.from(table).insert(payload).select("id").single();
  const result = await query;
  ensureResult(result, "Der Eintrag konnte nicht gespeichert werden.");
  return result.data?.id;
}

export async function saveEditorial(record, { client = null } = {}) {
  return saveGeneric("editorial_content", record, [
    "content_type", "title", "body", "quote_attribution", "event_date", "event_year",
    "sort_order", "source_label", "source_url", "published",
  ], { client });
}

export async function saveUpcoming(record, { client = null } = {}) {
  return saveGeneric("upcoming_releases", record, [
    "original_title", "german_title", "role_name", "expected_release_date",
    "expected_release_window", "status_label", "notes", "source_label", "source_url",
    "source_checked_at", "published",
  ], { client });
}

export async function saveConnection(record, { client = null } = {}) {
  return saveGeneric("film_connections", record, [
    "source_film_id", "target_film_id", "connection_type", "description", "source_label",
    "source_url", "source_checked_at", "published",
  ], { client });
}

export async function deleteRecord(table, id, { client = null } = {}) {
  if (!EDITABLE_TABLES.has(table)) throw new TypeError("Unsupported editable table.");
  const database = await clientFor(client);
  const result = await database.from(table).delete().eq("id", id);
  ensureResult(result, "Der Eintrag konnte nicht gelöscht werden.");
}

export async function applyCorrectionRows(rows, { client = null } = {}) {
  const database = await clientFor(client);
  const payload = rows.map((row) => pick(row, [
    "legacy_import_id", "release_year", "original_title", "german_title", "my_rating_percent",
  ]));
  const result = await database.from("films").upsert(payload, {
    onConflict: "legacy_import_id",
    ignoreDuplicates: false,
  }).select("id,legacy_import_id");
  ensureResult(result, "Der Korrekturimport konnte nicht gespeichert werden.");
  return result.data ?? [];
}

export async function reorderWatchlist(filmIds, { client = null } = {}) {
  const database = await clientFor(client);
  const results = await Promise.all(
    filmIds.map((id, index) =>
      database.from("films").update({ watchlist_priority: index + 1 }).eq("id", id),
    ),
  );
  results.forEach((result) => ensureResult(result, "Die Watchlist-Reihenfolge konnte nicht gespeichert werden."));
}

export async function uploadPoster(film, file, { client = null, config = APP_CONFIG } = {}) {
  if (!film?.id) throw new TypeError("A film is required for poster upload.");
  if (!file || !POSTER_TYPES.has(file.type)) {
    throw apiError("poster-type", "Erlaubt sind JPEG, PNG, WebP und AVIF.");
  }
  if (file.size > 8 * 1024 * 1024) throw apiError("poster-size", "Das Poster darf höchstens 8 MB groß sein.");
  const database = await clientFor(client);
  const extension = POSTER_TYPES.get(file.type);
  const path = `${film.id}/poster-${Date.now()}.${extension}`;
  const upload = await database.storage.from(config.posterBucket).upload(path, file, {
    cacheControl: "3600", contentType: file.type, upsert: false,
  });
  ensureResult(upload, "Das Poster konnte nicht hochgeladen werden.");
  const update = await database.from("films").update({ poster_path: path }).eq("id", film.id);
  ensureResult(update, "Der Posterpfad konnte nicht gespeichert werden.");
  if (film.poster_path && film.poster_path !== path) {
    await database.storage.from(config.posterBucket).remove([film.poster_path]);
  }
  return path;
}

export async function removePoster(film, { client = null, config = APP_CONFIG } = {}) {
  const database = await clientFor(client);
  const update = await database.from("films").update({ poster_path: null }).eq("id", film.id);
  ensureResult(update, "Der Posterpfad konnte nicht entfernt werden.");
  if (film.poster_path) {
    const removal = await database.storage.from(config.posterBucket).remove([film.poster_path]);
    ensureResult(removal, "Die Posterdatei konnte nicht entfernt werden.");
  }
}

export function slugify(value) {
  return String(value ?? "")
    .replaceAll("ß", "ss").replaceAll("ẞ", "ss")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function saveGeneric(table, record, allowed, { client }) {
  const database = await clientFor(client);
  const payload = pick(record, allowed);
  const id = cleanText(record.id);
  const result = await (id
    ? database.from(table).update(payload).eq("id", id).select("id").single()
    : database.from(table).insert(payload).select("id").single());
  ensureResult(result, "Der Eintrag konnte nicht gespeichert werden.");
  return result.data?.id;
}

async function replaceRelations(database, table, lookupColumn, filmId, ids) {
  const removed = await database.from(table).delete().eq("film_id", filmId);
  ensureResult(removed, "Zuordnungen konnten nicht aktualisiert werden.");
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return;
  const inserted = await database.from(table).insert(
    uniqueIds.map((id) => ({ film_id: filmId, [lookupColumn]: id })),
  );
  ensureResult(inserted, "Zuordnungen konnten nicht gespeichert werden.");
}

async function saveMetrics(database, filmId, metrics) {
  const payload = {
    film_id: filmId,
    wig: nullableNumber(metrics.wig),
    scream_intensity: nullableNumber(metrics.scream_intensity),
    explosions: nullableNumber(metrics.explosions),
    overacting_level: nullableNumber(metrics.overacting_level),
  };
  const hasValue = Object.entries(payload).some(([key, value]) => key !== "film_id" && value !== null);
  const result = hasValue
    ? await database.from("film_metrics").upsert(payload, { onConflict: "film_id" })
    : await database.from("film_metrics").delete().eq("film_id", filmId);
  ensureResult(result, "Cage-o-meter-Werte konnten nicht gespeichert werden.");
}

async function saveScores(database, filmId, scores) {
  for (const provider of ["rotten_tomatoes", "imdb"]) {
    const score = scores[provider] ?? null;
    if (!score?.hasValue) {
      const removed = await database.from("film_scores").delete()
        .eq("film_id", filmId).eq("provider", provider);
      ensureResult(removed, "Externe Scores konnten nicht aktualisiert werden.");
      continue;
    }
    if (!score.source_url || !score.retrieved_at) {
      throw apiError("score-source", "Jeder externe Score benötigt HTTPS-Quelle und Abrufdatum.");
    }
    const payload = provider === "imdb"
      ? {
          film_id: filmId, provider, imdb_score: score.imdb_score,
          rt_tomatometer_percent: null, rt_audience_percent: null,
          source_url: score.source_url, retrieved_at: score.retrieved_at,
          source_note: score.source_note || null,
        }
      : {
          film_id: filmId, provider, imdb_score: null,
          rt_tomatometer_percent: score.rt_tomatometer_percent,
          rt_audience_percent: score.rt_audience_percent,
          source_url: score.source_url, retrieved_at: score.retrieved_at,
          source_note: score.source_note || null,
        };
    const saved = await database.from("film_scores").upsert(payload, {
      onConflict: "film_id,provider",
    });
    ensureResult(saved, "Externe Scores konnten nicht gespeichert werden.");
  }
}

async function clientFor(client) {
  return client ?? (await import("./supabase-client.js")).supabase;
}

function validatedPosterUrl(database, bucket, path, projectUrl) {
  const url = database.storage.from(bucket).getPublicUrl(path)?.data?.publicUrl;
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const project = new URL(projectUrl);
    return parsed.protocol === project.protocol && parsed.host === project.host ? parsed.href : null;
  } catch { return null; }
}

function pick(source, allowed) {
  return Object.fromEntries(allowed.filter((key) => key in (source ?? {})).map((key) => [key, source[key]]));
}

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function nullableNumber(value) {
  return value === "" || value === null || value === undefined ? null : Number(value);
}

function ensureResult(result, message) {
  if (!result || result.error) throw apiError("request", message);
}

function apiError(code, message) {
  return new AdminApiError(code, message);
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
