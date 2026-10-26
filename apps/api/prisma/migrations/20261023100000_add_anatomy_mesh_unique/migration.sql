-- Enforce a one-to-one mapping between a seeded structure and its GLB mesh
-- within a system. The same mesh name may be reused by a different system.
CREATE UNIQUE INDEX "AnatomyStructure_systemId_meshName_key" ON "AnatomyStructure"("systemId", "meshName");
