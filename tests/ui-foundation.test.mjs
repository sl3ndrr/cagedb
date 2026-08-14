// tests/ui-foundation.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createStore } from "../public/js/core/state.mjs";
import {
  matchRoute,
  normalizePath,
  parseHashLocation,
} from "../public/js/core/router.mjs";
import {
  createThemeController,
  getNextThemePreference,
} from "../public/js/core/theme.mjs";
import { ROUTES, createNotFoundRoute } from "../public/js/routes.mjs";
import { escapeHtml, renderRouteView } from "../public/js/views.mjs";

test("normalizes hash paths and preserves repeated query values", () => {
  const location = parseHashLocation("#/filme//?genre=action&tag=bee&tag=wig");

  assert.equal(location.path, "/filme");
  assert.deepEqual(location.query, {
    genre: "action",
    tag: ["bee", "wig"],
  });
  assert.equal(Object.isFrozen(location.query.tag), true);
});

test("matches a deep-linked film and decodes only its parameter", () => {
  const location = parseHashLocation("#/film/cage-1997-001%20a");
  const route = matchRoute(location, ROUTES);

  assert.equal(route.id, "film-detail");
  assert.equal(route.params.id, "cage-1997-001 a");
  assert.equal(route.navSection, "films");
});

test("does not turn an encoded slash into a second path segment", () => {
  const location = parseHashLocation("#/film/row%2Fchild");
  const route = matchRoute(location, ROUTES);

  assert.equal(location.path, "/film/row%2Fchild");
  assert.equal(route.params.id, "row/child");
});

test("creates a stable not-found route for unknown paths", () => {
  const location = parseHashLocation("#/unbekannt");
  const route = matchRoute(location, ROUTES) ?? createNotFoundRoute(location);

  assert.equal(route.id, "not-found");
  assert.equal(route.title, "Nicht gefunden");
  assert.equal(normalizePath("///unbekannt///"), "/unbekannt");
});

test("publishes immutable state transitions and supports unsubscribe", () => {
  const store = createStore({ count: 0, nested: { ready: false } });
  const actions = [];
  const unsubscribe = store.subscribe(({ action }) => actions.push(action));

  store.setState(
    (state) => ({ ...state, count: state.count + 1 }),
    "counter/increment",
  );
  unsubscribe();
  store.setState((state) => ({ ...state, count: 2 }), "counter/set");

  assert.deepEqual(actions, ["counter/increment"]);
  assert.equal(store.getState().count, 2);
  assert.equal(Object.isFrozen(store.getState().nested), true);
});

test("cycles system, light, and dark theme preferences", () => {
  assert.equal(getNextThemePreference("system"), "light");
  assert.equal(getNextThemePreference("light"), "dark");
  assert.equal(getNextThemePreference("dark"), "system");
});

test("applies system theme and persists a manual preference", () => {
  const storedValues = new Map();
  const mediaListeners = new Set();
  const windowListeners = new Set();
  const themeMeta = {
    content: null,
    setAttribute: (_name, value) => {
      themeMeta.content = value;
    },
  };
  const documentRef = {
    documentElement: { dataset: {} },
    querySelector: () => themeMeta,
  };
  const windowRef = {
    localStorage: {
      getItem: (key) => storedValues.get(key) ?? null,
      setItem: (key, value) => storedValues.set(key, value),
    },
    matchMedia: () => ({
      matches: true,
      addEventListener: (_type, listener) => mediaListeners.add(listener),
      removeEventListener: (_type, listener) => mediaListeners.delete(listener),
    }),
    addEventListener: (_type, listener) => windowListeners.add(listener),
    removeEventListener: (_type, listener) => windowListeners.delete(listener),
  };

  const controller = createThemeController({ documentRef, windowRef });
  assert.equal(documentRef.documentElement.dataset.theme, "dark");
  assert.equal(themeMeta.content, "#0b0d0f");

  controller.cycle();
  assert.equal(documentRef.documentElement.dataset.theme, "light");
  assert.equal(storedValues.get("cagedb.theme"), "light");

  controller.destroy();
  assert.equal(mediaListeners.size, 0);
  assert.equal(windowListeners.size, 0);
});

test("escapes route-controlled values before rendering", () => {
  const escaped = escapeHtml('<img src=x onerror="alert(1)">');

  assert.equal(escaped.includes("<img"), false);
  assert.equal(escaped.includes("&lt;img"), true);
});

test("keeps every admin route locked and free of edit controls", () => {
  const adminRoutes = ROUTES.filter((route) => route.private);

  assert.ok(adminRoutes.length > 0);
  for (const definition of adminRoutes) {
    const html = renderRouteView({ ...definition, location: { path: definition.pattern }, params: {} });
    assert.equal(html.includes('data-view="admin-locked"'), true);
    assert.equal(/<(form|input|textarea|select)\b/i.test(html), false);
  }
});

test("renders live home data safely with accessible metrics and a film link", () => {
  const route = {
    ...ROUTES.find((definition) => definition.id === "home"),
    location: { path: "/" },
    params: {},
  };
  const maliciousTitle = '<img src=x onerror="alert(1)">';
  const html = renderRouteView(route, {
    publicCatalog: {
      status: "ready",
      errorCode: null,
      data: {
        dailyDateKey: "2026-08-14",
        dailyCandidateCount: 2,
        dailyFilm: {
          id: "00000000-0000-4000-8000-000000000001",
          displayTitle: maliciousTitle,
          releaseYear: 1999,
          posterUrl: null,
          genres: [],
        },
        stats: {
          total: 3,
          seen: 1,
          watchlist: 2,
          averageRating: 75,
          cageOMeter: {
            overall: 2.5,
            assessedFilms: 1,
            metrics: {
              wig: 1,
              screamIntensity: 2,
              explosions: 3,
              overactingLevel: 4,
            },
          },
        },
      },
    },
  });

  assert.equal(html.includes("<img src=x"), false);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html, /href="#\/film\/00000000-0000-4000-8000-000000000001"/);
  assert.match(html, /Durchschnittliche Cage-o-meter-Werte/);
  assert.match(html, /75,0 %/);
});

test("keeps every home loading, error, and empty state structurally accessible", () => {
  const route = {
    ...ROUTES.find((definition) => definition.id === "home"),
    location: { path: "/" },
    params: {},
  };
  const emptyData = {
    dailyDateKey: "2026-08-14",
    dailyCandidateCount: 0,
    dailyFilm: null,
    stats: {
      total: 0,
      seen: 0,
      watchlist: 0,
      averageRating: null,
      cageOMeter: {
        overall: null,
        assessedFilms: 0,
        metrics: {
          wig: null,
          screamIntensity: null,
          explosions: null,
          overactingLevel: null,
        },
      },
    },
  };
  const states = [
    { status: "idle", data: null, errorCode: null },
    { status: "loading", data: null, errorCode: null },
    { status: "error", data: null, errorCode: "configuration" },
    { status: "error", data: null, errorCode: "request" },
    { status: "empty", data: emptyData, errorCode: null },
    {
      status: "ready",
      data: {
        ...emptyData,
        stats: { ...emptyData.stats, total: 1, seen: 1 },
      },
      errorCode: null,
    },
  ];

  for (const publicCatalog of states) {
    const html = renderRouteView(route, { publicCatalog });
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);

    assert.equal([...html.matchAll(/<h1(?:\s|>)/g)].length, 1);
    assert.equal(new Set(ids).size, ids.length, `${publicCatalog.status} repeats an id`);
    assert.equal(html.includes("undefined"), false);

    for (const match of html.matchAll(/aria-(?:labelledby|describedby)="([^"]+)"/g)) {
      for (const referencedId of match[1].split(/\s+/)) {
        assert.ok(ids.includes(referencedId), `${publicCatalog.status} misses ${referencedId}`);
      }
    }
  }
});

test("renders one H1 and valid local ARIA references for every route", () => {
  for (const definition of ROUTES) {
    const route = {
      ...definition,
      location: { path: definition.pattern },
      params: definition.id === "film-detail" ? { id: "film-test" } : {},
    };
    const html = renderRouteView(route);
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
    const headingCount = [...html.matchAll(/<h1(?:\s|>)/g)].length;

    assert.equal(headingCount, 1, `${definition.id} must render exactly one H1`);
    assert.equal(html.includes("undefined"), false, `${definition.id} renders undefined`);

    for (const match of html.matchAll(/aria-(?:labelledby|describedby)="([^"]+)"/g)) {
      for (const referencedId of match[1].split(/\s+/)) {
        assert.ok(ids.has(referencedId), `${definition.id} misses ARIA target ${referencedId}`);
      }
    }
  }
});

test("ships semantic shell hooks and reduced-motion handling", async () => {
  const [html, baseCss, motionCss] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/css/base.css", import.meta.url), "utf8"),
    readFile(new URL("../public/css/motion.css", import.meta.url), "utf8"),
  ]);

  assert.match(html, /<html lang="de">/);
  assert.match(html, /class="skip-link" href="#main-content"/);
  assert.match(html, /<main id="main-content" tabindex="-1">/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /type="module" src="\.\/js\/app\.mjs"/);
  assert.match(baseCss, /prefers-reduced-motion: reduce/);
  assert.match(motionCss, /prefers-reduced-motion: no-preference/);
});

test("keeps primary text color pairs above WCAG AA contrast", async () => {
  const tokensCss = await readFile(
    new URL("../public/css/tokens.css", import.meta.url),
    "utf8",
  );
  const lightStart = tokensCss.indexOf(':root[data-theme="light"]');
  const mediaStart = tokensCss.indexOf("@media (prefers-color-scheme: light)");
  const darkBlock = tokensCss.slice(0, lightStart);
  const lightBlock = tokensCss.slice(lightStart, mediaStart);

  const dark = readColorTokens(darkBlock);
  const light = readColorTokens(lightBlock);

  assert.ok(contrastRatio(dark["text-1"], dark["surface-0"]) >= 4.5);
  assert.ok(contrastRatio(dark["text-2"], dark["surface-0"]) >= 4.5);
  assert.ok(contrastRatio(dark["text-3"], dark["surface-1"]) >= 4.5);
  assert.ok(contrastRatio(dark.signal, dark["surface-1"]) >= 4.5);
  assert.ok(contrastRatio(dark.danger, dark["surface-1"]) >= 4.5);
  assert.ok(contrastRatio(dark.secondary, dark["surface-1"]) >= 4.5);
  assert.ok(contrastRatio(light["text-1"], light["surface-0"]) >= 4.5);
  assert.ok(contrastRatio(light["text-2"], light["surface-0"]) >= 4.5);
  assert.ok(contrastRatio(light["text-3"], light["surface-0"]) >= 4.5);
  assert.ok(contrastRatio(light.signal, light["surface-1"]) >= 4.5);
  assert.ok(contrastRatio(light.danger, light["surface-1"]) >= 4.5);
  assert.ok(contrastRatio(light.secondary, light["surface-1"]) >= 4.5);
});

function readColorTokens(cssBlock) {
  const tokens = {};
  for (const match of cssBlock.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)) {
    tokens[match[1]] = match[2];
  }
  return tokens;
}

function contrastRatio(first, second) {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort(
    (left, right) => right - left,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(hexColor) {
  const channels = hexColor
    .slice(1)
    .match(/.{2}/g)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );

  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
