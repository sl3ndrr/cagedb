// public/js/services/public-config.mjs
const PLACEHOLDER_PATTERN = /YOUR_(?:PROJECT_REF|PUBLIC_ANON_OR_PUBLISHABLE_KEY)/;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export class PublicConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "PublicConfigError";
    this.code = "configuration";
  }
}

export function assertPublicConfig(config) {
  const supabaseUrl = config?.supabaseUrl;
  const supabaseAnonKey = config?.supabaseAnonKey;

  if (
    typeof supabaseUrl !== "string" ||
    typeof supabaseAnonKey !== "string" ||
    !supabaseUrl.trim() ||
    !supabaseAnonKey.trim() ||
    PLACEHOLDER_PATTERN.test(`${supabaseUrl} ${supabaseAnonKey}`)
  ) {
    throw new PublicConfigError(
      "CageDB ist noch nicht mit Project URL und Publishable Key konfiguriert.",
    );
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    throw new PublicConfigError("Die konfigurierte Supabase-URL ist ungültig.");
  }

  const secure = parsedUrl.protocol === "https:";
  const localDevelopment =
    parsedUrl.protocol === "http:" && LOCAL_HOSTS.has(parsedUrl.hostname);
  if (!secure && !localDevelopment) {
    throw new PublicConfigError(
      "Die Supabase-URL muss HTTPS verwenden; HTTP ist nur lokal erlaubt.",
    );
  }

  return Object.freeze({
    supabaseUrl: parsedUrl.href.replace(/\/$/u, ""),
    supabaseAnonKey: supabaseAnonKey.trim(),
  });
}
