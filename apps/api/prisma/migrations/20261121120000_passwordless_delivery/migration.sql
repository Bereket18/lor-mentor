-- Additive: distinguish a challenge-shaped record that may be mailed from a
-- decoy created only to keep initiation indistinguishable. Existing rows are
-- deliverable, matching the previous behaviour.
ALTER TABLE "AuthChallenge" ADD COLUMN "deliverable" BOOLEAN NOT NULL DEFAULT true;
