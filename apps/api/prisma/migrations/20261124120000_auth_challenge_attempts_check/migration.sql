-- P1-8: defence in depth for the per-challenge attempt cap.
--
-- The claim and increment statements already require `attempts < 5`, so this
-- constraint changes no application behaviour. It makes an out-of-range value
-- impossible to store from a future code path, a manual edit or a bug.
--
-- Existing rows were checked before writing this migration: min 0, max 0.
ALTER TABLE "AuthChallenge"
  ADD CONSTRAINT "AuthChallenge_attempts_range"
  CHECK ("attempts" >= 0 AND "attempts" <= 5);
