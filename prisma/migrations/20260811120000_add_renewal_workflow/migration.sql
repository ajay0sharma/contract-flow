-- CreateEnum
CREATE TYPE "RenewalStatus" AS ENUM ('not_due', 'notice_window', 'renewal_in_progress', 'renewed', 'non_renewing');

-- CreateEnum
CREATE TYPE "RenewalReminderType" AS ENUM ('notice_90', 'notice_60', 'notice_30', 'notice_14', 'notice_7', 'expiration_day', 'action_deadline');

-- AlterTable
ALTER TABLE "Contract"
ADD COLUMN "autoRenewal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "renewalNoticeDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN "renewalStatus" "RenewalStatus" NOT NULL DEFAULT 'not_due',
ADD COLUMN "renewedFromContractId" TEXT,
ADD COLUMN "renewalStartedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Contract_renewalStatus_idx" ON "Contract"("renewalStatus");

-- CreateTable
CREATE TABLE "ContractRenewalReminder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "reminderType" "RenewalReminderType" NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractRenewalReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractRenewalReminder_organizationId_idx" ON "ContractRenewalReminder"("organizationId");

-- CreateIndex
CREATE INDEX "ContractRenewalReminder_contractId_idx" ON "ContractRenewalReminder"("contractId");

-- CreateIndex
CREATE INDEX "ContractRenewalReminder_sentAt_idx" ON "ContractRenewalReminder"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContractRenewalReminder_contractId_reminderType_recipientEmail_key" ON "ContractRenewalReminder"("contractId", "reminderType", "recipientEmail");

-- AddForeignKey
ALTER TABLE "ContractRenewalReminder" ADD CONSTRAINT "ContractRenewalReminder_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
