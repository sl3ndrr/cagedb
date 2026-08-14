<!-- supabase/STEP_2_README.md -->
# CageDB – Schritt 2: Supabase-Datenbank

## Ausführungsreihenfolge

Die Migrationen sind einzeln nachvollziehbar und nach erfolgreicher Ausführung
erneut ausführbar:

1. `migrations/20260814000100_foundation_and_admin.sql`
2. `migrations/20260814000200_catalog_schema.sql`
3. `migrations/20260814000300_editorial_schema.sql`
4. `migrations/20260814000400_triggers.sql`
5. `migrations/20260814000500_grants_and_rls.sql`
6. `migrations/20260814000600_poster_storage.sql`
7. `migrations/20260814000700_initial_import_rpc.sql`

Mit der Supabase CLI werden sie in dieser Reihenfolge durch `supabase db push`
ausgeführt. Alternativ kann jede Datei einzeln im SQL Editor ausgeführt werden.

## Initialen Admin anlegen

1. In Supabase unter **Authentication > Users** genau einen E-Mail-/Passwort-
   Benutzer anlegen und dessen E-Mail bestätigen.
2. Die UUID des Benutzers kopieren.
3. In `bootstrap/grant_initial_admin.sql` ausschließlich den Platzhalter
   `00000000-0000-0000-0000-000000000000` ersetzen.
4. Das Skript im SQL Editor als Datenbank-Owner ausführen.
5. Prüfen, dass die Abschlussabfrage exakt eine bestätigte E-Mail und die
   erwartete UUID ausgibt.
6. Unter **Authentication > Configuration** neue Registrierungen und anonyme
   Anmeldungen deaktivieren. CageDB enthält keine Registrierungsoberfläche.

Die Tabelle `private.admin_users` erzwingt genau einen Admin. Sie ist nicht über
die Data API exponiert und besitzt keine Client-Policy. Die Browser-App prüft
den eigenen Status ausschließlich über `public.is_admin()`; sämtliche
Schreibrechte bleiben zusätzlich durch RLS abgesichert.

## RLS-Test

`tests/rls_policies.test.sql` verwendet pgTAP, feste Test-UUIDs und eine äußere
Transaktion. Am Ende wird alles zurückgerollt. Abgedeckt sind:

- anonyme Nutzer,
- authentifizierte Nicht-Admins,
- der allowlist-basierte Admin,
- veröffentlichte und unveröffentlichte Zeilen,
- alle Anwendungstabellen,
- unvollständige Legacy-Scores,
- Poster-Storage-Policies,
- Insert-, Update- und Delete-Verweigerungen sowie erlaubtes Admin-CRUD.

Lokal kann der Test nach `supabase start` mit `supabase test db` ausgeführt
werden. Im SQL Editor kann die Testdatei ebenfalls komplett ausgeführt werden.
Erwartet werden ausschließlich `ok`-Zeilen und anschließend ein Rollback.

Der Test schreibt für die Storage-Prüfung kurzzeitig ausschließlich Metadaten
und rollt sie zurück. Echte Posteroperationen müssen immer über die Supabase
Storage API erfolgen.

## Externe Scores

Der Erstimport darf Legacy-Werte ohne Quelle nur über den lokalen Service-Role-
Import anlegen. Solche Zeilen sind für den Admin sichtbar, aber öffentlich per
RLS verborgen. Eine Admin-Änderung wird erst akzeptiert, wenn `source_url` und
`retrieved_at` gesetzt sind.

Service-Role-Schlüssel gehören ausschließlich in die lokale Laufzeitumgebung.
Sie dürfen niemals in diese Dateien, `config.js`, GitHub oder Browser-Code
eingetragen werden.
