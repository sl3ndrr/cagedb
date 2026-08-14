// public/js/core/router.mjs
export function parseHashLocation(hash = "") {
  const rawLocation = hash.startsWith("#") ? hash.slice(1) : hash;
  const separatorIndex = rawLocation.indexOf("?");
  const rawPath = separatorIndex >= 0 ? rawLocation.slice(0, separatorIndex) : rawLocation;
  const rawQuery = separatorIndex >= 0 ? rawLocation.slice(separatorIndex + 1) : "";
  const path = normalizePath(rawPath);
  const searchParams = new URLSearchParams(rawQuery);

  return Object.freeze({
    path,
    query: freezeQuery(searchParams),
    search: searchParams.toString(),
  });
}

export function matchRoute(location, routes) {
  for (const route of routes) {
    const compiled = compilePattern(route.pattern);
    const match = compiled.regexp.exec(location.path);

    if (!match) {
      continue;
    }

    const params = Object.fromEntries(
      compiled.keys.map((key, index) => [key, safeDecode(match[index + 1] ?? "")]),
    );

    return Object.freeze({
      ...route,
      location,
      params: Object.freeze(params),
    });
  }

  return null;
}

export function createHashRouter({ routes, onChange, windowRef = window }) {
  if (!Array.isArray(routes) || typeof onChange !== "function") {
    throw new TypeError("Router requires a route array and an onChange callback.");
  }

  let started = false;

  function resolve() {
    const location = parseHashLocation(windowRef.location.hash);
    onChange(matchRoute(location, routes), location);
  }

  function start() {
    if (started) {
      return;
    }

    started = true;
    windowRef.addEventListener("hashchange", resolve);

    if (!windowRef.location.hash) {
      const baseUrl = `${windowRef.location.pathname}${windowRef.location.search}#/`;
      windowRef.history.replaceState(null, "", baseUrl);
    }

    resolve();
  }

  function stop() {
    if (!started) {
      return;
    }

    started = false;
    windowRef.removeEventListener("hashchange", resolve);
  }

  function navigate(target, { replace = false } = {}) {
    const normalizedTarget = target.startsWith("/") ? target : `/${target}`;
    const nextHash = `#${normalizedTarget}`;

    if (windowRef.location.hash === nextHash) {
      resolve();
      return;
    }

    if (replace) {
      const baseUrl = `${windowRef.location.pathname}${windowRef.location.search}${nextHash}`;
      windowRef.history.replaceState(null, "", baseUrl);
      resolve();
    } else {
      windowRef.location.hash = normalizedTarget;
    }
  }

  return Object.freeze({ navigate, resolve, start, stop });
}

export function normalizePath(path) {
  const withoutHash = String(path || "/").replace(/^#/, "");
  const compactPath = `/${withoutHash}`.replace(/\/{2,}/g, "/");
  const trimmedPath =
    compactPath.length > 1 ? compactPath.replace(/\/+$/, "") : compactPath;

  return trimmedPath;
}

function compilePattern(pattern) {
  if (pattern === "/") {
    return { regexp: /^\/$/, keys: [] };
  }

  const keys = [];
  const expression = pattern
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      if (segment.startsWith(":")) {
        keys.push(segment.slice(1));
        return "([^/]+)";
      }
      return escapeRegularExpression(segment);
    })
    .join("/");

  return {
    regexp: new RegExp(`^/${expression}/?$`),
    keys,
  };
}

function freezeQuery(searchParams) {
  const query = {};

  for (const [key, value] of searchParams) {
    if (!(key in query)) {
      query[key] = value;
    } else if (Array.isArray(query[key])) {
      query[key].push(value);
    } else {
      query[key] = [query[key], value];
    }
  }

  for (const value of Object.values(query)) {
    if (Array.isArray(value)) {
      Object.freeze(value);
    }
  }

  return Object.freeze(query);
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
