-- CreateEnum
CREATE TYPE "RiskScore" AS ENUM ('not_scored', 'low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "RiskSeverity" AS ENUM ('low', 'medium', 'high', 'critical');

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "riskScore" "RiskScore" NOT NULL DEFAULT 'not_scored',
ADD COLUMN "riskScoreCompletedAt" TIMESTAMP(3),
ADD COLUMN "riskScoreSummary" TEXT;

-- CreateTable
CREATE TABLE "RiskFactor" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "RiskSeverity" NOT NULL,
    "clauseReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskFactor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RiskFactor_contractId_idx" ON "RiskFactor"("contractId");

-- CreateIndex
CREATE INDEX "RiskFactor_organizationId_idx" ON "RiskFactor"("organizationId");

-- CreateIndex
CREATE INDEX "RiskFactor_category_idx" ON "RiskFactor"("category");

-- AddForeignKey
ALTER TABLE "RiskFactor" ADD CONSTRAINT "RiskFactor_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
