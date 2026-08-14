// public/js/core/theme.mjs
const STORAGE_KEY = "cagedb.theme";
const PREFERENCES = Object.freeze(["system", "light", "dark"]);
const LABELS = Object.freeze({
  system: "System",
  light: "Hell",
  dark: "Dunkel",
});
const THEME_COLORS = Object.freeze({
  light: "#f4f1eb",
  dark: "#0b0d0f",
});

export function getNextThemePreference(preference) {
  const currentIndex = PREFERENCES.indexOf(preference);
  return PREFERENCES[(currentIndex + 1) % PREFERENCES.length];
}

export function getThemeLabel(preference) {
  return LABELS[preference] ?? LABELS.system;
}

export function createThemeController({
  documentRef = document,
  windowRef = window,
  onChange = () => {},
} = {}) {
  const colorSchemeQuery = windowRef.matchMedia("(prefers-color-scheme: dark)");
  let preference = readPreference(windowRef.localStorage);

  function getResolvedTheme() {
    return preference === "system"
      ? colorSchemeQuery.matches
        ? "dark"
        : "light"
      : preference;
  }

  function apply({ announce = false } = {}) {
    const resolved = getResolvedTheme();
    documentRef.documentElement.dataset.theme = resolved;
    documentRef.documentElement.dataset.themePreference = preference;

    const themeColor = documentRef.querySelector("[data-theme-color]");
    if (themeColor) {
      themeColor.setAttribute("content", THEME_COLORS[resolved]);
    }

    onChange(Object.freeze({ preference, resolved, announce }));
  }

  function setPreference(nextPreference, { announce = true } = {}) {
    if (!PREFERENCES.includes(nextPreference)) {
      throw new TypeError(`Unknown theme preference: ${nextPreference}`);
    }

    preference = nextPreference;
    writePreference(windowRef.localStorage, preference);
    apply({ announce });
  }

  function cycle() {
    setPreference(getNextThemePreference(preference));
  }

  function handleSystemChange() {
    if (preference === "system") {
      apply();
    }
  }

  function handleStorage(event) {
    if (event.key !== STORAGE_KEY) {
      return;
    }

    preference = PREFERENCES.includes(event.newValue) ? event.newValue : "system";
    apply();
  }

  colorSchemeQuery.addEventListener("change", handleSystemChange);
  windowRef.addEventListener("storage", handleStorage);
  apply();

  return Object.freeze({
    cycle,
    getState: () => Object.freeze({ preference, resolved: getResolvedTheme() }),
    setPreference,
    destroy() {
      colorSchemeQuery.removeEventListener("change", handleSystemChange);
      windowRef.removeEventListener("storage", handleStorage);
    },
  });
}

function readPreference(storage) {
  try {
    const value = storage.getItem(STORAGE_KEY);
    return PREFERENCES.includes(value) ? value : "system";
  } catch {
    return "system";
  }
}

function writePreference(storage, preference) {
  try {
    storage.setItem(STORAGE_KEY, preference);
  } catch {
    // The preference still applies for this tab if storage is unavailable.
  }
}
