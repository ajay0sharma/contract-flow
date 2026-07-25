-- Rename enum value to match updated schema
ALTER TYPE "ClauseStatus" RENAME VALUE 'non_standard_requires_review' TO 'non_standard';

-- Rename Clause table to ClauseLibrary
ALTER TABLE "Clause" RENAME TO "ClauseLibrary";

-- Rename columns on ClauseLibrary
ALTER TABLE "ClauseLibrary" RENAME COLUMN "createdBy" TO "createdById";
ALTER TABLE "ClauseLibrary" RENAME COLUMN "notesForNegotiators" TO "notes";

-- Convert contractTypes from TEXT[] to JSONB
ALTER TABLE "ClauseLibrary"
ALTER COLUMN "contractTypes" TYPE JSONB
USING to_jsonb("contractTypes");

-- Rename indexes
ALTER INDEX "Clause_pkey" RENAME TO "ClauseLibrary_pkey";
ALTER INDEX "Clause_organizationId_idx" RENAME TO "ClauseLibrary_organizationId_idx";
ALTER INDEX "Clause_category_idx" RENAME TO "ClauseLibrary_category_idx";
ALTER INDEX "Clause_status_idx" RENAME TO "ClauseLibrary_status_idx";

-- CreateTable
CREATE TABLE "ClauseUsage" (
    "id" TEXT NOT NULL,
    "clauseId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "usedText" TEXT NOT NULL,
    "isDeviation" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClauseUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClauseUsage_clauseId_idx" ON "ClauseUsage"("clauseId");

-- CreateIndex
CREATE INDEX "ClauseUsage_contractId_idx" ON "ClauseUsage"("contractId");

-- CreateIndex
CREATE INDEX "ClauseUsage_organizationId_idx" ON "ClauseUsage"("organizationId");

-- AddForeignKey
ALTER TABLE "ClauseUsage" ADD CONSTRAINT "ClauseUsage_clauseId_fkey" FOREIGN KEY ("clauseId") REFERENCES "ClauseLibrary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClauseUsage" ADD CONSTRAINT "ClauseUsage_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
