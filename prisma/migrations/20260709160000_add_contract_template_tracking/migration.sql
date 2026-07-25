-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "templateId" TEXT,
ADD COLUMN "templateVersion" INTEGER;

-- CreateIndex
CREATE INDEX "Contract_templateId_idx" ON "Contract"("templateId");
