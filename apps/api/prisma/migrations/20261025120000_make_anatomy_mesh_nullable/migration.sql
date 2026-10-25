-- Allow text-only structures that have teaching content but no independently
-- selectable mesh in the shipped model. PostgreSQL treats NULLs as distinct in
-- the (systemId, meshName) unique index, so multiple text-only rows are valid.
ALTER TABLE "AnatomyStructure" ALTER COLUMN "meshName" DROP NOT NULL;
