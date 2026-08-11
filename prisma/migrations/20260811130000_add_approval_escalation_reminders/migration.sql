-- CreateEnum
CREATE TYPE "ApprovalReminderType" AS ENUM ('reminder_1', 'reminder_3', 'reminder_7', 'reminder_14', 'escalation');

-- CreateTable
CREATE TABLE "ContractApprovalReminder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "reminderType" "ApprovalReminderType" NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractApprovalReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractApprovalReminder_organizationId_idx" ON "ContractApprovalReminder"("organizationId");

-- CreateIndex
CREATE INDEX "ContractApprovalReminder_contractId_idx" ON "ContractApprovalReminder"("contractId");

-- CreateIndex
CREATE INDEX "ContractApprovalReminder_sentAt_idx" ON "ContractApprovalReminder"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContractApprovalReminder_contractId_reminderType_recipientEmail_key" ON "ContractApprovalReminder"("contractId", "reminderType", "recipientEmail");

-- AddForeignKey
ALTER TABLE "ContractApprovalReminder" ADD CONSTRAINT "ContractApprovalReminder_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
