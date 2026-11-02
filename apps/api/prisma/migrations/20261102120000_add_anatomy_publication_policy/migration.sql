-- College-approved anatomy review and administrator publication policy.
--
-- Additive only: no columns are dropped or altered, and no existing anatomy
-- content, revision, audit, reviewer flag, or publication state is rewritten.
--
-- 1. AnatomySystem gains a content revision counter plus a separate
--    administrator approval (approver + timestamp + approved revision).
--    Publishing requires the approval to match the current content revision.
-- 2. AnatomyStructure links its sign-off to the immutable revision row that
--    captured the approved text.
-- 3. AnatomyStructureRevision gains a `kind` discriminator so sign-off and
--    sign-off-invalidation events live in the same history as edits.
-- 4. AnatomyReviewSettings is a new singleton table for lab-wide policy
--    (currently `requireSecondReviewer`, default OFF).

ALTER TABLE "AnatomySystem"
ADD COLUMN "contentRevision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "publicationApprovedAt" TIMESTAMP(3),
ADD COLUMN "publicationApprovedById" TEXT,
ADD COLUMN "publicationApprovedRevision" INTEGER;

ALTER TABLE "AnatomyStructure"
ADD COLUMN "reviewedRevisionId" TEXT;

ALTER TABLE "AnatomyStructureRevision"
ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'edit';

CREATE TABLE "AnatomyReviewSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "requireSecondReviewer" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    CONSTRAINT "AnatomyReviewSettings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AnatomySystem_publicationApprovedById_idx"
ON "AnatomySystem"("publicationApprovedById");

CREATE INDEX "AnatomyStructure_reviewedRevisionId_idx"
ON "AnatomyStructure"("reviewedRevisionId");

ALTER TABLE "AnatomySystem"
ADD CONSTRAINT "AnatomySystem_publicationApprovedById_fkey"
FOREIGN KEY ("publicationApprovedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AnatomyStructure"
ADD CONSTRAINT "AnatomyStructure_reviewedRevisionId_fkey"
FOREIGN KEY ("reviewedRevisionId") REFERENCES "AnatomyStructureRevision"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
