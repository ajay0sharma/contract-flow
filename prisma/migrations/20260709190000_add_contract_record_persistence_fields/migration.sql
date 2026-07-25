-- CreateEnum
CREATE TYPE "ContractStage" AS ENUM ('request', 'legal_review', 'vp_review', 'finance_review', 'executive_signoff', 'awaiting_signature', 'active', 'rejected');

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "recordNumber" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contract" ADD COLUMN "requesterName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contract" ADD COLUMN "requesterEmail" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contract" ADD COLUMN "department" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contract" ADD COLUMN "contractType" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contract" ADD COLUMN "contractStartDate" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contract" ADD COLUMN "contractEndDate" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contract" ADD COLUMN "title" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contract" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contract" ADD COLUMN "amount" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contract" ADD COLUMN "amountNumeric" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Contract" ADD COLUMN "budgeted" BOOLEAN;
ALTER TABLE "Contract" ADD COLUMN "poNumber" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contract" ADD COLUMN "supplierId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contract" ADD COLUMN "supplierName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contract" ADD COLUMN "parentAgreementId" TEXT;
ALTER TABLE "Contract" ADD COLUMN "parentAgreementRecordNumber" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contract" ADD COLUMN "parentAgreementTitle" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contract" ADD COLUMN "confidential" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Contract" ADD COLUMN "otherNotes" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contract" ADD COLUMN "companyName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contract" ADD COLUMN "address" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contract" ADD COLUMN "mainContactName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contract" ADD COLUMN "mainContactTitle" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contract" ADD COLUMN "mainContactEmail" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contract" ADD COLUMN "mainContactPhone" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contract" ADD COLUMN "counterpartyId" TEXT;
ALTER TABLE "Contract" ADD COLUMN "companyProfileId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contract" ADD COLUMN "stage" "ContractStage" NOT NULL DEFAULT 'legal_review';
ALTER TABLE "Contract" ADD COLUMN "currentStepIndex" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Contract" ADD COLUMN "workflowSteps" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Contract" ADD COLUMN "auditTrail" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Contract" ADD COLUMN "attachments" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Contract" ADD COLUMN "relatedEmails" JSONB NOT NULL DEFAULT '[]';

-- Backfill companyProfileId from organizationId for existing rows
UPDATE "Contract" SET "companyProfileId" = "organizationId" WHERE "companyProfileId" = '';

-- CreateIndex
CREATE INDEX "Contract_companyProfileId_idx" ON "Contract"("companyProfileId");
CREATE INDEX "Contract_stage_idx" ON "Contract"("stage");
CREATE INDEX "Contract_recordNumber_idx" ON "Contract"("recordNumber");
