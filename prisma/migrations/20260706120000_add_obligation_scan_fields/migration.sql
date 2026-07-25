-- CreateEnum
CREATE TYPE "ObligationScanStatus" AS ENUM ('not_scanned', 'scanning', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "ObligationStatus" AS ENUM ('active', 'completed', 'waived');

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "obligationScanStatus" "ObligationScanStatus" NOT NULL DEFAULT 'not_scanned',
    "obligationScanCompletedAt" TIMESTAMP(3),
    "obligations" JSONB,
    "obligationSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Obligation" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "obligationType" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "frequency" TEXT,
    "status" "ObligationStatus" NOT NULL DEFAULT 'active',
    "counterpartyName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Obligation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contract_organizationId_idx" ON "Contract"("organizationId");

-- CreateIndex
CREATE INDEX "Obligation_contractId_idx" ON "Obligation"("contractId");

-- CreateIndex
CREATE INDEX "Obligation_organizationId_idx" ON "Obligation"("organizationId");

-- CreateIndex
CREATE INDEX "Obligation_counterpartyName_idx" ON "Obligation"("counterpartyName");

-- AddForeignKey
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
