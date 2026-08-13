-- Flip a stored Grok 4.3/4.5 active-model selection to Grok 4.6 so production
-- switches on migrate without an admin Settings click. Leaves Claude/GPT
-- selections untouched. Idempotent: a later re-run is a no-op.
UPDATE app_setting
SET
  value = 'grok-4.6',
  updated_by = 'migration:0018',
  updated_at = (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint
WHERE key = 'active_model'
  AND value IN ('grok-4.3', 'grok-4.5');
