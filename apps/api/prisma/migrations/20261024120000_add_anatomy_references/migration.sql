-- Add source references (FMA concepts and textbook citations) to anatomy
-- structures. Existing rows get an empty array so they remain valid.
ALTER TABLE "AnatomyStructure"
ADD COLUMN "references" TEXT[] DEFAULT ARRAY[]::TEXT[];
