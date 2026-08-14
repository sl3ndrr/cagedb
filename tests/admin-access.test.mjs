// tests/admin-access.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

import { AdminApiError, resolveAdminAccess, slugify } from "../public/js/services/admin-api.mjs";

test("does not call the admin RPC for an anonymous browser session", async () => {
  const fake = fakeClient({ session: null });
  const result = await resolveAdminAccess({ client: fake.client });
  assert.equal(result.status, "anonymous");
  assert.equal(fake.calls.includes("rpc"), false);
});

test("requires both a server-validated user and allowlist membership", async () => {
  const session = { user: { id: "user-1" } };
  const nonAdmin = fakeClient({ session, user: session.user, isAdmin: false });
  const admin = fakeClient({ session, user: session.user, isAdmin: true });
  assert.equal((await resolveAdminAccess({ client: nonAdmin.client })).status, "forbidden");
  assert.equal((await resolveAdminAccess({ client: admin.client })).status, "authorized");
});

test("invalid server user sessions are removed locally", async () => {
  const fake = fakeClient({ session: { user: { id: "stale" } }, userError: true });
  const result = await resolveAdminAccess({ client: fake.client });
  assert.equal(result.status, "anonymous");
  assert.ok(fake.calls.includes("signOut"));
});

test("maps authorization failures to a non-sensitive error", async () => {
  const fake = fakeClient({ session: { user: { id: "u" } }, user: { id: "u" }, rpcError: true });
  await assert.rejects(
    () => resolveAdminAccess({ client: fake.client }),
    (error) => error instanceof AdminApiError && !error.message.includes("backend detail"),
  );
});

test("creates database-safe lookup slugs", () => {
  assert.equal(slugify("  Science-Fiction & Spaß "), "science-fiction-spass");
});

function fakeClient({ session, user = null, isAdmin = false, userError = false, rpcError = false }) {
  const calls = [];
  return {
    calls,
    client: {
      auth: {
        async getSession() { calls.push("getSession"); return { data: { session }, error: null }; },
        async getUser() { calls.push("getUser"); return { data: { user }, error: userError ? { message: "backend detail" } : null }; },
        async signOut() { calls.push("signOut"); return { error: null }; },
      },
      async rpc() { calls.push("rpc"); return { data: isAdmin, error: rpcError ? { message: "backend detail" } : null }; },
    },
  };
}
