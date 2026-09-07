-- Champions-first cutover (ADR-4, CF-DATA-BR-3, CF-OPS-US-1).
-- DELETE non-Champions index rows; DROP other-game warehouse tables.
-- Do NOT UPDATE team.format (archive is derived, ADR-3). Do NOT DELETE
-- conversations, messages, shares, turn_record, or account*.
DELETE FROM "pokemon" WHERE "format" <> 'champions';
--> statement-breakpoint
DELETE FROM "learnset" WHERE "format" <> 'champions';
--> statement-breakpoint
DELETE FROM "reference_cache" WHERE "format" <> 'champions';
--> statement-breakpoint
DELETE FROM "searchable_names" WHERE "format" <> 'champions';
--> statement-breakpoint
DELETE FROM "ingest_meta" WHERE "format" <> 'champions';
--> statement-breakpoint
-- Revoke leftover oak_readonly grants from 0009/0012 before DROP so a later
-- role probe does not see privileges on missing tables. Defensive: table or
-- role may already be absent (fresh schema / no CREATEROLE).
DO $$
DECLARE
  tbl text;
  dropped text[] := ARRAY[
    'wiki_chunk',
    'wiki_page',
    'natdex_species',
    'natdex_machines',
    'natdex_moves',
    'classic_encounters',
    'pmd_recruits',
    'meta_usage',
    'meta_snapshot'
  ];
BEGIN
  FOREACH tbl IN ARRAY dropped LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM oak_readonly', tbl);
    EXCEPTION
      WHEN undefined_table THEN
        NULL;
      WHEN undefined_object THEN
        NULL;
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'oak_readonly: could not REVOKE on %', tbl;
    END;
  END LOOP;
END $$;
--> statement-breakpoint
DROP TABLE IF EXISTS "wiki_chunk";
--> statement-breakpoint
DROP TABLE IF EXISTS "wiki_page";
--> statement-breakpoint
DROP TABLE IF EXISTS "natdex_species";
--> statement-breakpoint
DROP TABLE IF EXISTS "natdex_machines";
--> statement-breakpoint
DROP TABLE IF EXISTS "natdex_moves";
--> statement-breakpoint
DROP TABLE IF EXISTS "classic_encounters";
--> statement-breakpoint
DROP TABLE IF EXISTS "pmd_recruits";
--> statement-breakpoint
DROP TABLE IF EXISTS "meta_usage";
--> statement-breakpoint
DROP TABLE IF EXISTS "meta_snapshot";
