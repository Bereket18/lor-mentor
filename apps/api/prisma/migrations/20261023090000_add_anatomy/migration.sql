-- CreateTable
CREATE TABLE "AnatomySystem" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latinName" TEXT,
    "description" TEXT NOT NULL,
    "modelUrl" TEXT,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnatomySystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnatomyStructure" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latinName" TEXT,
    "summary" TEXT NOT NULL,
    "location" TEXT,
    "function" TEXT,
    "bloodSupply" TEXT,
    "clinicalNotes" TEXT,
    "meshName" TEXT NOT NULL,
    "layer" TEXT,
    "relatedSlugs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isReviewed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnatomyStructure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnatomySystem_slug_key" ON "AnatomySystem"("slug");

-- CreateIndex
CREATE INDEX "AnatomySystem_isPublished_sortOrder_idx" ON "AnatomySystem"("isPublished", "sortOrder");

-- CreateIndex
CREATE INDEX "AnatomyStructure_systemId_sortOrder_idx" ON "AnatomyStructure"("systemId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AnatomyStructure_systemId_slug_key" ON "AnatomyStructure"("systemId", "slug");

-- AddForeignKey
ALTER TABLE "AnatomyStructure" ADD CONSTRAINT "AnatomyStructure_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "AnatomySystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
