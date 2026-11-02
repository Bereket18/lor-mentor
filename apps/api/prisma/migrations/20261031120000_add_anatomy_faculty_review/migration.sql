-- Step 4: faculty anatomy review and edit tool.
--
-- Reviewers are TEACHER accounts explicitly flagged by the local
-- anatomy:reviewer script. ADMIN/SUPER_ADMIN stay blocked at the role guard.
ALTER TABLE "User"
ADD COLUMN "isAnatomyReviewer" BOOLEAN NOT NULL DEFAULT false;

-- reviewedAt/reviewedById are set together when a row is approved. Editing a
-- reviewed row clears both and sets isReviewed = false.
ALTER TABLE "AnatomyStructure"
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewedById" TEXT;

-- One immutable revision per successful save. previous/new contain only the
-- editable teaching fields; note is an optional reviewer note.
CREATE TABLE "AnatomyStructureRevision" (
    "id" TEXT NOT NULL,
    "structureId" TEXT NOT NULL,
    "editorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previous" JSONB NOT NULL,
    "new" JSONB NOT NULL,
    "note" TEXT,
    CONSTRAINT "AnatomyStructureRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AnatomyStructure_reviewedById_idx"
ON "AnatomyStructure"("reviewedById");

CREATE INDEX "AnatomyStructureRevision_structureId_createdAt_idx"
ON "AnatomyStructureRevision"("structureId", "createdAt");

CREATE INDEX "AnatomyStructureRevision_editorId_idx"
ON "AnatomyStructureRevision"("editorId");

ALTER TABLE "AnatomyStructure"
ADD CONSTRAINT "AnatomyStructure_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AnatomyStructureRevision"
ADD CONSTRAINT "AnatomyStructureRevision_structureId_fkey"
FOREIGN KEY ("structureId") REFERENCES "AnatomyStructure"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnatomyStructureRevision"
ADD CONSTRAINT "AnatomyStructureRevision_editorId_fkey"
FOREIGN KEY ("editorId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
