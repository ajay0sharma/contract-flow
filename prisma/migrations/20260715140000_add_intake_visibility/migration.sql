-- AlterTable
ALTER TABLE "ContractTypeDefinition" ADD COLUMN "showInIntake" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ContractTemplate" ADD COLUMN "showInIntake" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "ContractTypeDefinition_organizationId_showInIntake_idx" ON "ContractTypeDefinition"("organizationId", "showInIntake");
