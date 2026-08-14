// public/js/app.mjs
import { appStore } from "./app-state.mjs";
import { createBackupCsv, parseCorrectionCsv, CsvValidationError } from "./domain/admin-csv.mjs";
import { secureRandomFraction, selectWatchlistFilm } from "./domain/catalog.mjs";
import { revealRoute } from "./core/motion.mjs";
import { createHashRouter } from "./core/router.mjs";
import { createThemeController, getNextThemePreference, getThemeLabel } from "./core/theme.mjs";
import { ROUTES, createNotFoundRoute } from "./routes.mjs";
import { PublicCatalogError, loadPublicCatalog } from "./services/public-catalog.mjs";
import { renderRouteView } from "./views.mjs";

document.documentElement.classList.add("js");

const PUBLIC_DATA_ROUTES = new Set(["home", "films", "film-detail", "stats", "bio", "wall", "wheel", "universe"]);
const elements = {
  skipLink: requiredElement("[data-skip-link]"),
  main: requiredElement("#main-content"),
  routeView: requiredElement("[data-route-view]"),
  routeAnnouncer: requiredElement("[data-route-announcer]"),
  themeAnnouncer: requiredElement("[data-theme-announcer]"),
  themeButton: requiredElement("[data-theme-toggle]"),
  themeLabel: requiredElement("[data-theme-label]"),
  systemTheme: requiredElement("[data-system-theme]"),
  menuButton: requiredElement("[data-menu-toggle]"),
  siteNav: requiredElement("[data-site-nav]"),
  siteHeader: requiredElement("[data-site-header]"),
  currentYear: requiredElement("[data-current-year]"),
};

let authUnsubscribe = null;
let draggedFilmId = null;
elements.currentYear.textContent = String(new Date().getFullYear());

elements.skipLink.addEventListener("click", (event) => {
  event.preventDefault();
  elements.main.focus();
  elements.main.scrollIntoView({ block: "start", behavior: "auto" });
});

const themeController = createThemeController({
  onChange(theme) {
    appStore.setState((state) => ({ ...state, theme }), "theme/change");
  },
});

const router = createHashRouter({
  routes: ROUTES,
  onChange(route, location) {
    appStore.setState((state) => ({
      ...state,
      route: route ?? createNotFoundRoute(location),
      ui: { ...state.ui, menuOpen: false },
    }), "router/navigate");
  },
});

appStore.subscribe(({ state, previousState, action }) => {
  const initial = action === "state/subscribe";
  const routeChanged = state.route !== previousState.route;
  const catalogChanged = state.publicCatalog !== previousState.publicCatalog;
  const sessionChanged = state.session !== previousState.session;
  const wheelChanged = state.ui.wheelFilmId !== previousState.ui.wheelFilmId;

  if (initial || state.theme !== previousState.theme) updateThemeUi(state.theme);
  if (initial || state.ui.menuOpen !== previousState.ui.menuOpen) updateMenuUi(state.ui.menuOpen);
  if (routeChanged && state.route) renderRoute(state.route, { navigation: true });
  else if ((catalogChanged && PUBLIC_DATA_ROUTES.has(state.route?.id)) ||
    (sessionChanged && state.route?.private) || (wheelChanged && state.route?.id === "wheel")) {
    renderRoute(state.route, { navigation: false });
  }

  if (routeChanged && PUBLIC_DATA_ROUTES.has(state.route?.id)) queueMicrotask(() => void ensurePublicCatalog());
  if (routeChanged && state.route?.private) queueMicrotask(() => void ensureAdmin());
  if (!initial && catalogChanged) announceCatalog(state.publicCatalog);
}, { immediate: true });

elements.themeButton.addEventListener("click", () => themeController.cycle());
elements.menuButton.addEventListener("click", () => appStore.setState((state) => ({
  ...state, ui: { ...state.ui, menuOpen: !state.ui.menuOpen },
}), "navigation/toggle-menu"));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && appStore.getState().ui.menuOpen) {
    appStore.setState((state) => ({ ...state, ui: { ...state.ui, menuOpen: false } }), "navigation/close-menu");
    elements.menuButton.focus();
  }
});

document.addEventListener("click", (event) => {
  if (appStore.getState().ui.menuOpen && event.target instanceof Node && !elements.siteHeader.contains(event.target)) {
    appStore.setState((state) => ({ ...state, ui: { ...state.ui, menuOpen: false } }), "navigation/outside-click");
  }
});

elements.routeView.addEventListener("click", (event) => void handleClick(event));
elements.routeView.addEventListener("submit", (event) => void handleSubmit(event));
elements.routeView.addEventListener("dragstart", handleDragStart);
elements.routeView.addEventListener("dragover", handleDragOver);
elements.routeView.addEventListener("drop", (event) => void handleDrop(event));
elements.routeView.addEventListener("dragend", () => { draggedFilmId = null; });
elements.routeView.addEventListener("error", handlePosterError, true);

router.start();

function renderRoute(route, { navigation }) {
  const state = appStore.getState();
  elements.routeView.innerHTML = renderRouteView(route, {
    publicCatalog: state.publicCatalog,
    session: state.session,
    wheelFilmId: state.ui.wheelFilmId,
  });
  document.title = `${route.title} · CageDB`;
  updateActiveNavigation(route.navSection);
  if (navigation) {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    requestAnimationFrame(() => {
      elements.main.focus({ preventScroll: true });
      elements.routeAnnouncer.textContent = `${route.title} geladen.`;
    });
    void revealRoute(elements.routeView);
  }
}

async function ensurePublicCatalog({ force = false } = {}) {
  const current = appStore.getState().publicCatalog;
  if (current.status === "loading" || (!force && ["ready", "empty"].includes(current.status))) return;
  appStore.setState((state) => ({ ...state, publicCatalog: { status: "loading", data: null, errorCode: null } }), force ? "catalog/retry" : "catalog/load");
  try {
    const data = await loadPublicCatalog();
    appStore.setState((state) => ({ ...state, publicCatalog: {
      status: data.stats.total ? "ready" : "empty", data, errorCode: null,
    } }), "catalog/success");
  } catch (error) {
    appStore.setState((state) => ({ ...state, publicCatalog: {
      status: "error", data: null,
      errorCode: error instanceof PublicCatalogError ? error.code : "network",
    } }), "catalog/failure");
  }
}

async function ensureAdmin({ force = false } = {}) {
  const current = appStore.getState().session;
  if (current.status === "checking" || (!force && current.status === "ready")) return;
  setSession({ ...current, status: "checking", errorCode: null });
  try {
    const api = await adminApi();
    const access = await api.resolveAdminAccess();
    if (access.status !== "authorized") {
      setSession({ status: access.status, data: null, errorCode: null, csvPreview: null, notice: null });
      return;
    }
    const data = await api.loadAdminData();
    setSession({ status: "ready", data, errorCode: null, csvPreview: current.csvPreview ?? null, notice: null });
    if (!authUnsubscribe) {
      authUnsubscribe = await api.subscribeToAuthChanges(() => {
        if (appStore.getState().route?.private) void ensureAdmin({ force: true });
      });
    }
  } catch {
    setSession({ status: "error", data: null, errorCode: "admin-request", csvPreview: null, notice: null });
  }
}

async function refreshAdmin(message) {
  const api = await adminApi();
  const data = await api.loadAdminData();
  const previous = appStore.getState().session;
  setSession({ ...previous, status: "ready", data, notice: message ? { tone: "success", message } : previous.notice });
  elements.routeAnnouncer.textContent = message ?? "Admindaten aktualisiert.";
}

async function handleClick(event) {
  if (!(event.target instanceof Element)) return;
  const target = event.target;
  if (target.closest("[data-public-retry]")) return void ensurePublicCatalog({ force: true });
  if (target.closest("[data-spin-wheel]")) return spinWheel();
  if (target.closest("[data-admin-logout]")) return logout();

  const deleteFilmButton = target.closest("[data-delete-film]");
  if (deleteFilmButton) return deleteFilm(deleteFilmButton);
  const deleteRecordButton = target.closest("[data-delete-record]");
  if (deleteRecordButton) return deleteRecord(deleteRecordButton);
  const removePosterButton = target.closest("[data-poster-remove]");
  if (removePosterButton) return removePoster(removePosterButton.dataset.posterRemove);
  if (target.closest("[data-csv-export]")) return exportCsv();
  if (target.closest("[data-csv-apply]")) return applyCsv();
  const moveButton = target.closest("[data-priority-move]");
  if (moveButton) return movePriority(moveButton);
}

async function handleSubmit(event) {
  if (!(event.target instanceof HTMLFormElement)) return;
  const form = event.target;
  event.preventDefault();
  try {
    setFormBusy(form, true);
    if (form.matches("[data-archive-filter]")) submitArchiveFilter(form);
    else if (form.matches("[data-admin-login]")) await submitLogin(form);
    else if (form.matches("[data-film-form]")) await submitFilm(form);
    else if (form.matches("[data-poster-upload]")) await submitPoster(form);
    else if (form.matches("[data-lookup-form]")) await submitLookup(form);
    else if (form.matches("[data-csv-preview]")) await submitCsvPreview(form);
    else if (form.matches("[data-editorial-form]")) await submitEditorial(form);
    else if (form.matches("[data-upcoming-form]")) await submitUpcoming(form);
    else if (form.matches("[data-connection-form]")) await submitConnection(form);
  } catch (error) {
    const message = error instanceof CsvValidationError
      ? error.issues.join(" ")
      : error instanceof Error ? error.message : "Die Aktion ist fehlgeschlagen.";
    setAdminNotice(message, "danger");
    elements.routeAnnouncer.textContent = message;
  } finally {
    if (form.isConnected) setFormBusy(form, false);
  }
}

function submitArchiveFilter(form) {
  const params = new URLSearchParams();
  for (const [key, value] of new FormData(form)) {
    if (String(value).trim() && !(key === "status" && value === "all")) params.set(key, String(value));
  }
  router.navigate(`/filme${params.size ? `?${params}` : ""}`);
}

async function submitLogin(form) {
  const values = new FormData(form);
  const api = await adminApi();
  await api.signInWithPassword(String(values.get("email") ?? ""), String(values.get("password") ?? ""));
  await ensureAdmin({ force: true });
  if (appStore.getState().session.status === "ready") router.navigate("/admin", { replace: true });
}

async function submitFilm(form) {
  const values = new FormData(form);
  const published = values.has("published");
  if (published && form.dataset.wasPublished !== "true" && !window.confirm("Diesen Film jetzt öffentlich veröffentlichen?")) return;
  const rating = optionalNumber(values.get("my_rating_percent"));
  const rtCritics = optionalNumber(values.get("rt_tomatometer"));
  const rtAudience = optionalNumber(values.get("rt_audience"));
  const imdbScore = optionalNumber(values.get("imdb_score"));
  const bundle = {
    film: {
      id: optionalText(values.get("id")), legacy_import_id: optionalText(values.get("legacy_import_id")),
      release_year: optionalNumber(values.get("release_year")), original_title: requiredText(values.get("original_title")),
      german_title: optionalText(values.get("german_title")), my_rating_percent: rating,
      notes: optionalText(values.get("notes")), watchlist_priority: rating === null ? optionalNumber(values.get("watchlist_priority")) : null,
      published,
    },
    genreIds: values.getAll("genre_ids").map(String),
    tagIds: values.getAll("tag_ids").map(String),
    metrics: {
      wig: optionalNumber(values.get("metric_wig")), scream_intensity: optionalNumber(values.get("metric_scream_intensity")),
      explosions: optionalNumber(values.get("metric_explosions")), overacting_level: optionalNumber(values.get("metric_overacting_level")),
    },
    scores: {
      rotten_tomatoes: {
        hasValue: rtCritics !== null || rtAudience !== null,
        rt_tomatometer_percent: rtCritics, rt_audience_percent: rtAudience,
        source_url: optionalText(values.get("rt_source_url")), retrieved_at: optionalText(values.get("rt_retrieved_at")),
      },
      imdb: {
        hasValue: imdbScore !== null, imdb_score: imdbScore,
        source_url: optionalText(values.get("imdb_source_url")), retrieved_at: optionalText(values.get("imdb_retrieved_at")),
      },
    },
  };
  const id = await (await adminApi()).saveFilmBundle(bundle);
  await refreshAdmin("Film gespeichert.");
  router.navigate(`/admin/filme?edit=${encodeURIComponent(id)}`, { replace: true });
}

async function submitPoster(form) {
  const values = new FormData(form);
  const id = String(values.get("film_id"));
  const film = adminData().films.find((item) => item.id === id);
  await (await adminApi()).uploadPoster(film, values.get("poster"));
  await refreshAdmin("Poster hochgeladen.");
}

async function submitLookup(form) {
  const values = new FormData(form);
  const table = form.dataset.lookupForm;
  const record = {
    id: optionalText(values.get("id")), name: requiredText(values.get("name")),
    slug: requiredText(values.get("slug")), published: values.has("published"),
  };
  if (record.published && !lookupWasPublished(table, record.id) && !window.confirm("Diesen Lookup-Wert öffentlich veröffentlichen?")) return;
  if (table === "genres") record.accent_color = optionalText(values.get("accent_color"));
  else record.kind = String(values.get("kind"));
  await (await adminApi()).saveLookup(table, record);
  await refreshAdmin(`${table === "genres" ? "Genre" : "Tag"} gespeichert.`);
  router.navigate("/admin/genres", { replace: true });
}

async function submitCsvPreview(form) {
  const file = new FormData(form).get("csv");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv")) throw new Error("Bitte eine CSV-Datei auswählen.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Die CSV-Datei darf höchstens 5 MB groß sein.");
  const preview = parseCorrectionCsv(await file.text());
  setSession({ ...appStore.getState().session, csvPreview: preview, notice: { tone: "success", message: "CSV-Vorschau erstellt; noch nichts gespeichert." } });
}

async function submitEditorial(form) {
  const record = formRecord(form, ["id", "content_type", "title", "body", "quote_attribution", "event_date", "event_year", "sort_order", "source_label", "source_url"]);
  record.event_year = optionalNumber(record.event_year); record.sort_order = optionalNumber(record.sort_order) ?? 0; record.published = new FormData(form).has("published");
  if (["fact", "quote"].includes(record.content_type) && !record.source_label) {
    throw new Error("Fakten und Zitate benötigen eine Quellenbezeichnung.");
  }
  if (record.content_type === "quote" && !record.quote_attribution) {
    throw new Error("Ein Zitat benötigt eine Zuschreibung.");
  }
  if (record.content_type === "timeline" && !record.event_date && record.event_year === null) {
    throw new Error("Ein Timeline-Eintrag benötigt Datum oder Jahr.");
  }
  if (!(await confirmPublishing("editorial", record.id, record.published))) return;
  await (await adminApi()).saveEditorial(record); await refreshAdmin("Redaktioneller Inhalt gespeichert."); router.navigate("/admin/redaktion", { replace: true });
}

async function submitUpcoming(form) {
  const record = formRecord(form, ["id", "original_title", "german_title", "role_name", "expected_release_date", "expected_release_window", "status_label", "notes", "source_label", "source_url", "source_checked_at"]);
  record.published = new FormData(form).has("published");
  if (!record.source_label || !record.source_checked_at) {
    throw new Error("Kommende Veröffentlichungen benötigen Quelle und Prüfdatum.");
  }
  if (!(await confirmPublishing("upcoming", record.id, record.published))) return;
  await (await adminApi()).saveUpcoming(record); await refreshAdmin("Veröffentlichung gespeichert."); router.navigate("/admin/redaktion", { replace: true });
}

async function submitConnection(form) {
  const record = formRecord(form, ["id", "source_film_id", "target_film_id", "connection_type", "description", "source_label", "source_url", "source_checked_at"]);
  record.published = new FormData(form).has("published");
  if (!record.source_label || !record.source_checked_at) {
    throw new Error("Filmverbindungen benötigen Quelle und Prüfdatum.");
  }
  if (record.source_film_id === record.target_film_id) throw new Error("Ausgangs- und Zielfilm müssen verschieden sein.");
  if (!(await confirmPublishing("connections", record.id, record.published))) return;
  await (await adminApi()).saveConnection(record); await refreshAdmin("Verbindung gespeichert."); router.navigate("/admin/redaktion", { replace: true });
}

async function deleteFilm(button) {
  if (!window.confirm(`Film „${button.dataset.label}“ endgültig löschen? Zugeordnete Daten und Posterpfad werden mitgelöscht.`)) return;
  await guardedMutation(async () => {
    const api = await adminApi();
    const film = adminData().films.find((item) => item.id === button.dataset.deleteFilm);
    if (film?.poster_path) await api.removePoster(film);
    await api.deleteFilm(button.dataset.deleteFilm);
    await refreshAdmin("Film gelöscht.");
    router.navigate("/admin/filme", { replace: true });
  });
}

async function deleteRecord(button) {
  if (!window.confirm(`„${button.dataset.label}“ endgültig löschen?`)) return;
  await guardedMutation(async () => { await (await adminApi()).deleteRecord(button.dataset.table, button.dataset.deleteRecord); await refreshAdmin("Eintrag gelöscht."); });
}

async function removePoster(id) {
  const film = adminData().films.find((item) => item.id === id);
  if (!film || !window.confirm(`Poster von „${film.display_title}“ entfernen?`)) return;
  await guardedMutation(async () => { await (await adminApi()).removePoster(film); await refreshAdmin("Poster entfernt."); });
}

function exportCsv() {
  const csv = createBackupCsv(adminData());
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = `cagedb-backup-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  elements.routeAnnouncer.textContent = "CSV-Backup erstellt.";
}

async function applyCsv() {
  const preview = appStore.getState().session.csvPreview;
  if (!preview || !window.confirm(`${preview.stats.total} geprüfte Korrekturzeilen per Import-ID einspielen? Persönliche Bewertung bleibt die einzige Gesehen-Quelle.`)) return;
  await guardedMutation(async () => {
    await (await adminApi()).applyCorrectionRows(preview.rows);
    setSession({ ...appStore.getState().session, csvPreview: null });
    await refreshAdmin("CSV-Korrekturimport abgeschlossen.");
  });
}

function spinWheel() {
  const catalog = appStore.getState().publicCatalog.data;
  if (!catalog) return;
  const film = selectWatchlistFilm(catalog.films, secureRandomFraction());
  appStore.setState((state) => ({ ...state, ui: { ...state.ui, wheelFilmId: film?.id ?? null } }), "wheel/spin");
  elements.routeAnnouncer.textContent = film ? `Ausgelost: ${film.displayTitle}.` : "Keine Watchlist-Filme vorhanden.";
}

function movePriority(button) {
  const item = button.closest("[data-film-id]");
  const list = item?.closest("[data-priority-list]");
  if (!item || !list) return;
  const sibling = button.dataset.priorityMove === "up" ? item.previousElementSibling : item.nextElementSibling;
  if (!sibling) return;
  if (button.dataset.priorityMove === "up") list.insertBefore(item, sibling); else list.insertBefore(sibling, item);
  void persistPriority(list);
}

function handleDragStart(event) {
  const item = event.target instanceof Element ? event.target.closest("[data-film-id]") : null;
  if (!item) return;
  draggedFilmId = item.dataset.filmId;
  event.dataTransfer?.setData("text/plain", draggedFilmId);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

function handleDragOver(event) {
  const target = event.target instanceof Element ? event.target.closest("[data-film-id]") : null;
  if (!target || !draggedFilmId || target.dataset.filmId === draggedFilmId) return;
  event.preventDefault();
}

async function handleDrop(event) {
  const target = event.target instanceof Element ? event.target.closest("[data-film-id]") : null;
  const dragged = elements.routeView.querySelector(`[data-film-id="${CSS.escape(draggedFilmId ?? "")}"]`);
  if (!target || !dragged || target === dragged) return;
  event.preventDefault();
  target.parentElement.insertBefore(dragged, target);
  draggedFilmId = null;
  await persistPriority(target.parentElement);
}

async function persistPriority(list) {
  const ids = [...list.querySelectorAll("[data-film-id]")].map((item) => item.dataset.filmId);
  await guardedMutation(async () => { await (await adminApi()).reorderWatchlist(ids); await refreshAdmin("Watchlist-Reihenfolge gespeichert."); });
}

async function logout() {
  await guardedMutation(async () => {
    await (await adminApi()).signOut();
    setSession({ status: "anonymous", data: null, errorCode: null, csvPreview: null, notice: null });
    router.navigate("/admin/login", { replace: true });
  });
}

async function guardedMutation(operation) {
  try { await operation(); }
  catch (error) { const message = error instanceof Error ? error.message : "Die Aktion ist fehlgeschlagen."; setAdminNotice(message, "danger"); elements.routeAnnouncer.textContent = message; }
}

function setAdminNotice(message, tone) {
  const current = appStore.getState().session;
  setSession({ ...current, notice: { message, tone } });
}

function setSession(session) {
  appStore.setState((state) => ({ ...state, session }), "admin/session");
}

function adminData() {
  const data = appStore.getState().session.data;
  if (!data) throw new Error("Die Admin-Daten sind nicht geladen.");
  return data;
}

function lookupWasPublished(table, id) {
  if (!id) return false;
  const collection = table === "genres" ? adminData().genres : adminData().tags;
  return collection.find((item) => item.id === id)?.published === true;
}

async function confirmPublishing(collection, id, published) {
  if (!published) return true;
  const old = id ? adminData()[collection].find((item) => item.id === id) : null;
  return old?.published === true || window.confirm("Diesen redaktionellen Eintrag jetzt öffentlich veröffentlichen?");
}

function formRecord(form, keys) {
  const values = new FormData(form);
  return Object.fromEntries(keys.map((key) => [key, optionalText(values.get(key))]));
}

function setFormBusy(form, busy) {
  form.setAttribute("aria-busy", String(busy));
  for (const button of form.querySelectorAll("button")) button.disabled = busy;
}

function handlePosterError(event) {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.matches("[data-poster-image]")) return;
  image.hidden = true;
  image.closest("[data-poster-media]")?.setAttribute("aria-label", image.dataset.fallbackLabel ?? "Kein Filmplakat verfügbar.");
}

function announceCatalog(catalog) {
  if (catalog.status === "loading") elements.routeAnnouncer.textContent = "Veröffentlichte Filmdaten werden geladen.";
  else if (["ready", "empty"].includes(catalog.status)) elements.routeAnnouncer.textContent = `${catalog.data.stats.total} veröffentlichte Filme geladen.`;
  else if (catalog.status === "error") elements.routeAnnouncer.textContent = "Filmdaten konnten nicht geladen werden.";
}

function updateActiveNavigation(activeSection) {
  for (const link of document.querySelectorAll("[data-route-link]")) {
    if (link.dataset.navSection === activeSection) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

function updateThemeUi(theme) {
  const currentLabel = getThemeLabel(theme.preference);
  const nextLabel = getThemeLabel(getNextThemePreference(theme.preference));
  elements.themeLabel.textContent = currentLabel;
  elements.themeButton.setAttribute("aria-label", `Darstellung: ${currentLabel}. Wechseln zu ${nextLabel}.`);
  elements.systemTheme.textContent = getThemeLabel(theme.resolved).toUpperCase();
  if (theme.announce) elements.themeAnnouncer.textContent = `Darstellung auf ${currentLabel} gesetzt.`;
}

function updateMenuUi(open) {
  elements.siteNav.dataset.open = String(open);
  elements.menuButton.setAttribute("aria-expanded", String(open));
  elements.menuButton.setAttribute("aria-label", open ? "Menü schließen" : "Menü öffnen");
}

function optionalText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}
function requiredText(value) { const text = optionalText(value); if (!text) throw new Error("Ein Pflichtfeld ist leer."); return text; }
function optionalNumber(value) { const text = optionalText(value); return text === null ? null : Number(text); }
function requiredElement(selector) { const element = document.querySelector(selector); if (!element) throw new Error(`Required UI element is missing: ${selector}`); return element; }
async function adminApi() { return import("./services/admin-api.mjs"); }
