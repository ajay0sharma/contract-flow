-- CreateEnum
CREATE TYPE "ContractLifecycleStatus" AS ENUM ('draft', 'pending', 'active', 'expired', 'rejected');

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "expiryDate" TIMESTAMP(3),
ADD COLUMN     "effectiveDate" TIMESTAMP(3),
ADD COLUMN     "activatedAt" TIMESTAMP(3),
ADD COLUMN     "expiredAt" TIMESTAMP(3),
ADD COLUMN     "contractStatus" "ContractLifecycleStatus" NOT NULL DEFAULT 'draft';

-- CreateIndex
CREATE INDEX "Contract_contractStatus_idx" ON "Contract"("contractStatus");

-- CreateIndex
CREATE INDEX "Contract_activatedAt_idx" ON "Contract"("activatedAt");

-- CreateIndex
CREATE INDEX "Contract_expiryDate_idx" ON "Contract"("expiryDate");
