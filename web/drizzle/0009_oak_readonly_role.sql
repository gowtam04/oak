-- Oak v2 P2 — read-only warehouse role for the T18 `run_sql` sandbox.
--
-- Hand-authored (drizzle-kit does not emit roles/grants). Creates a NOLOGIN
-- role `oak_readonly` with SELECT on ONLY the warehouse allowlist tables, plus
-- USAGE on the current schema, and grants membership to the connecting role so
-- the sandbox can `SET LOCAL ROLE oak_readonly`. The whole thing is idempotent
-- and defensive: if the executing role lacks CREATEROLE (e.g. a Fly attach
-- role), it logs a NOTICE and skips — the sandbox then falls back to its
-- transaction-level READ ONLY floor plus a deny-list. Runs unqualified so it
-- targets whatever schema the migration runs in (public in prod; the isolated
-- per-test schema under Vitest), granting on each schema's own tables.
DO $$
DECLARE
  tbl text;
  allow text[] := ARRAY[
    'pokemon',
    'learnset',
    'reference_cache',
    'searchable_names',
    'ingest_meta',
    'champions_item_exclusion',
    'natdex_species',
    'natdex_machines',
    'natdex_moves',
    'classic_encounters',
    'pmd_recruits'
  ];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oak_readonly') THEN
    BEGIN
      CREATE ROLE oak_readonly NOLOGIN;
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'oak_readonly: no CREATEROLE privilege; run_sql will use the READ ONLY + deny-list fallback';
        RETURN;
      WHEN duplicate_object OR unique_violation THEN
        NULL; -- created concurrently by a parallel migration (either error code)
    END;
  END IF;

  BEGIN
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO oak_readonly', current_schema());
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'oak_readonly: could not GRANT USAGE on schema %', current_schema();
  END;

  FOREACH tbl IN ARRAY allow LOOP
    BEGIN
      EXECUTE format('GRANT SELECT ON %I TO oak_readonly', tbl);
    EXCEPTION
      WHEN undefined_table THEN
        NULL; -- table absent in this schema; skip
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'oak_readonly: could not GRANT SELECT on %', tbl;
    END;
  END LOOP;

  BEGIN
    EXECUTE format('GRANT oak_readonly TO %I', current_user);
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'oak_readonly: could not grant membership to %', current_user;
    WHEN unique_violation OR duplicate_object THEN
      NULL; -- membership already granted concurrently
  END;
END $$;
