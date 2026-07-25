-- CreateEnum
CREATE TYPE "ObligationType" AS ENUM (
  'payment',
  'reporting',
  'delivery',
  'compliance',
  'notice',
  'confidentiality',
  'ip_ownership',
  'indemnification',
  'insurance',
  'non_compete',
  'data_protection',
  'audit_right',
  'renewal_notice',
  'termination_notice',
  'milestone',
  'other'
);

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "executedDocumentPath" TEXT;
ALTER TABLE "Contract" ADD COLUMN "executedDocumentName" TEXT;
ALTER TABLE "Contract" ADD COLUMN "executedDocumentSize" INTEGER;
ALTER TABLE "Contract" ADD COLUMN "executedUploadedAt" TIMESTAMP(3);
ALTER TABLE "Contract" ADD COLUMN "executedUploadedById" TEXT;
ALTER TABLE "Contract" ADD COLUMN "obligationScanVersion" INTEGER;

-- AlterTable
ALTER TABLE "Obligation" ADD COLUMN "noticePeriodDays" INTEGER;
ALTER TABLE "Obligation" ADD COLUMN "actionDeadline" TIMESTAMP(3);
ALTER TABLE "Obligation" ADD COLUMN "responsibleParty" TEXT;
ALTER TABLE "Obligation" ADD COLUMN "contractTitle" TEXT;
ALTER TABLE "Obligation" ADD COLUMN "recordNumber" TEXT;
ALTER TABLE "Obligation" ADD COLUMN "sourceClause" TEXT;
ALTER TABLE "Obligation" ADD COLUMN "confidenceScore" TEXT;

ALTER TABLE "Obligation" ALTER COLUMN "counterpartyName" DROP NOT NULL;

ALTER TABLE "Obligation"
  ALTER COLUMN "obligationType" TYPE "ObligationType"
  USING (
    CASE lower("obligationType")
      WHEN 'payment' THEN 'payment'::"ObligationType"
      WHEN 'reporting' THEN 'reporting'::"ObligationType"
      WHEN 'delivery' THEN 'delivery'::"ObligationType"
      WHEN 'compliance' THEN 'compliance'::"ObligationType"
      WHEN 'notice' THEN 'notice'::"ObligationType"
      WHEN 'confidentiality' THEN 'confidentiality'::"ObligationType"
      WHEN 'ip_ownership' THEN 'ip_ownership'::"ObligationType"
      WHEN 'indemnification' THEN 'indemnification'::"ObligationType"
      WHEN 'insurance' THEN 'insurance'::"ObligationType"
      WHEN 'non_compete' THEN 'non_compete'::"ObligationType"
      WHEN 'data_protection' THEN 'data_protection'::"ObligationType"
      WHEN 'audit_right' THEN 'audit_right'::"ObligationType"
      WHEN 'renewal_notice' THEN 'renewal_notice'::"ObligationType"
      WHEN 'termination_notice' THEN 'termination_notice'::"ObligationType"
      WHEN 'milestone' THEN 'milestone'::"ObligationType"
      ELSE 'other'::"ObligationType"
    END
  );

-- CreateIndex
CREATE INDEX "Obligation_obligationType_idx" ON "Obligation"("obligationType");
CREATE INDEX "Obligation_status_idx" ON "Obligation"("status");
CREATE INDEX "Obligation_dueDate_idx" ON "Obligation"("dueDate");
