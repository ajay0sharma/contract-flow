-- Backfill empty record numbers before adding a unique constraint
UPDATE "Contract" AS c
SET "recordNumber" = source.new_record_number
FROM (
  SELECT
    id,
    CONCAT('CR-', LPAD(ROW_NUMBER() OVER (ORDER BY "createdAt")::text, 6, '0')) AS new_record_number
  FROM "Contract"
  WHERE "recordNumber" = '' OR "recordNumber" IS NULL
) AS source
WHERE c.id = source.id;

-- Drop redundant non-unique index before creating the unique constraint
DROP INDEX IF EXISTS "Contract_recordNumber_idx";

-- AlterTable
ALTER TABLE "Contract" ALTER COLUMN "department" DROP NOT NULL;
ALTER TABLE "Contract" ALTER COLUMN "department" DROP DEFAULT;

ALTER TABLE "Contract" ALTER COLUMN "contractStartDate" DROP NOT NULL;
ALTER TABLE "Contract" ALTER COLUMN "contractStartDate" DROP DEFAULT;

ALTER TABLE "Contract" ALTER COLUMN "contractEndDate" DROP NOT NULL;
ALTER TABLE "Contract" ALTER COLUMN "contractEndDate" DROP DEFAULT;

ALTER TABLE "Contract" ALTER COLUMN "description" DROP NOT NULL;
ALTER TABLE "Contract" ALTER COLUMN "description" DROP DEFAULT;

ALTER TABLE "Contract" ALTER COLUMN "amount" DROP NOT NULL;
ALTER TABLE "Contract" ALTER COLUMN "amount" DROP DEFAULT;

ALTER TABLE "Contract" ALTER COLUMN "amountNumeric" DROP DEFAULT;
ALTER TABLE "Contract" ALTER COLUMN "amountNumeric" TYPE DECIMAL(19, 4) USING "amountNumeric"::decimal;
ALTER TABLE "Contract" ALTER COLUMN "amountNumeric" DROP NOT NULL;

ALTER TABLE "Contract" ALTER COLUMN "poNumber" DROP NOT NULL;
ALTER TABLE "Contract" ALTER COLUMN "poNumber" DROP DEFAULT;

ALTER TABLE "Contract" ALTER COLUMN "otherNotes" DROP NOT NULL;
ALTER TABLE "Contract" ALTER COLUMN "otherNotes" DROP DEFAULT;

ALTER TABLE "Contract" ALTER COLUMN "companyName" DROP NOT NULL;
ALTER TABLE "Contract" ALTER COLUMN "companyName" DROP DEFAULT;

ALTER TABLE "Contract" ALTER COLUMN "address" DROP NOT NULL;
ALTER TABLE "Contract" ALTER COLUMN "address" DROP DEFAULT;

ALTER TABLE "Contract" ALTER COLUMN "mainContactName" DROP NOT NULL;
ALTER TABLE "Contract" ALTER COLUMN "mainContactName" DROP DEFAULT;

ALTER TABLE "Contract" ALTER COLUMN "mainContactTitle" DROP NOT NULL;
ALTER TABLE "Contract" ALTER COLUMN "mainContactTitle" DROP DEFAULT;

ALTER TABLE "Contract" ALTER COLUMN "mainContactEmail" DROP NOT NULL;
ALTER TABLE "Contract" ALTER COLUMN "mainContactEmail" DROP DEFAULT;

ALTER TABLE "Contract" ALTER COLUMN "mainContactPhone" DROP NOT NULL;
ALTER TABLE "Contract" ALTER COLUMN "mainContactPhone" DROP DEFAULT;

ALTER TABLE "Contract" ALTER COLUMN "companyProfileId" DROP NOT NULL;
ALTER TABLE "Contract" ALTER COLUMN "companyProfileId" DROP DEFAULT;

ALTER TABLE "Contract" ALTER COLUMN "attachments" DROP NOT NULL;
ALTER TABLE "Contract" ALTER COLUMN "attachments" DROP DEFAULT;

ALTER TABLE "Contract" ALTER COLUMN "relatedEmails" DROP NOT NULL;
ALTER TABLE "Contract" ALTER COLUMN "relatedEmails" DROP DEFAULT;

ALTER TABLE "Contract" ADD COLUMN "intakeFormId" TEXT;
ALTER TABLE "Contract" ADD COLUMN "generatedDraftPath" TEXT;
ALTER TABLE "Contract" ADD COLUMN "missingVariables" JSONB;
ALTER TABLE "Contract" ADD COLUMN "contractVariables" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "Contract_recordNumber_key" ON "Contract"("recordNumber");
CREATE INDEX "Contract_requesterEmail_idx" ON "Contract"("requesterEmail");
CREATE INDEX "Contract_contractType_idx" ON "Contract"("contractType");
