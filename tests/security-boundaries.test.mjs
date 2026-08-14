// tests/security-boundaries.test.mjs
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("keeps server credentials and source data outside the static site", async () => {
  const files = await walk(path.join(root, "public"));
  assert.equal(files.some((file) => /\.(?:csv|xlsx|xls|env)$/i.test(file)), false);
  const text = (await Promise.all(files.filter((file) => /\.(?:html|css|js|mjs)$/i.test(file)).map((file) => readFile(file, "utf8")))).join("\n");
  assert.doesNotMatch(text, /sb_secret_/i);
  assert.doesNotMatch(text, /SUPABASE_SECRET_KEY/);
  assert.doesNotMatch(text, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(text, /service[_-]?role[_-]?key/i);
});

test("ships a restrictive browser policy and a pinned ESM database client", async () => {
  const [html, client] = await Promise.all([
    readFile(path.join(root, "public/index.html"), "utf8"),
    readFile(path.join(root, "public/js/services/supabase-client.js"), "utf8"),
  ]);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /object-src 'none'/);
  assert.match(html, /base-uri 'self'/);
  assert.match(client, /@supabase\/supabase-js@2\.112\.3/);
  assert.match(client, /detectSessionInUrl: false/);
});

test("grants the initial-import RPC only to the trusted server role", async () => {
  const migration = await readFile(
    path.join(root, "supabase/migrations/20260814000700_initial_import_rpc.sql"),
    "utf8",
  );
  assert.match(migration, /revoke all on function public\.import_initial_films\(jsonb\) from anon, authenticated/);
  assert.match(migration, /grant execute on function public\.import_initial_films\(jsonb\) to service_role/);
  assert.match(migration, /security invoker/);
});

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const location = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(location));
    else if (entry.isFile()) result.push(location);
  }
  return result;
}
