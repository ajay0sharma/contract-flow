-- CreateEnum
CREATE TYPE "ClauseStatus" AS ENUM ('approved', 'approved_with_modification', 'non_standard_requires_review', 'deprecated');

-- CreateTable
CREATE TABLE "Clause" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "contractTypes" TEXT[],
    "status" "ClauseStatus" NOT NULL DEFAULT 'approved',
    "preferredText" TEXT NOT NULL,
    "alternativeText" TEXT,
    "notesForNegotiators" TEXT,
    "lastReviewedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Clause_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Clause_organizationId_idx" ON "Clause"("organizationId");

-- CreateIndex
CREATE INDEX "Clause_category_idx" ON "Clause"("category");

-- CreateIndex
CREATE INDEX "Clause_status_idx" ON "Clause"("status");
