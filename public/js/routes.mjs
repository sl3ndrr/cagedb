// public/js/routes.mjs
export const ROUTES = Object.freeze([
  route("home", "/", "Start", "home"),
  route("films", "/filme", "Filmarchiv", "films"),
  route("film-detail", "/film/:id", "Filmdetail", "films"),
  route("stats", "/statistik", "Statistik", "stats"),
  route("bio", "/bio", "Biografie", "bio"),
  route("wall", "/wall-of-fame", "Wall of Fame", null),
  route("wheel", "/losrad", "Losrad", "wheel"),
  route("universe", "/cage-universe", "Cage Cinematic Universe", null),
  route("admin", "/admin", "Adminzugang", "admin", true),
  route("admin-login", "/admin/login", "Admin-Anmeldung", "admin", true),
  route("admin-films", "/admin/filme", "Admin · Filme", "admin", true),
  route("admin-genres", "/admin/genres", "Admin · Genres", "admin", true),
  route("admin-import", "/admin/import", "Admin · Import", "admin", true),
  route("admin-editorial", "/admin/redaktion", "Admin · Redaktion", "admin", true),
]);

export function createNotFoundRoute(location) {
  return Object.freeze({
    id: "not-found",
    pattern: null,
    title: "Nicht gefunden",
    navSection: null,
    private: false,
    location,
    params: Object.freeze({}),
  });
}

function route(id, pattern, title, navSection, isPrivate = false) {
  return Object.freeze({
    id,
    pattern,
    title,
    navSection,
    private: isPrivate,
  });
}
