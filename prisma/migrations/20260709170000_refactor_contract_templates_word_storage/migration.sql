-- CreateEnum
CREATE TYPE "ContractTemplateType" AS ENUM ('vendor', 'customer', 'nda', 'employment', 'saas', 'consulting', 'partnership', 'other');

-- CreateEnum
CREATE TYPE "TemplateVariableFieldType" AS ENUM ('text', 'date', 'number', 'currency', 'select', 'email', 'yes_no');

-- DropForeignKey (if exists from prior attempts)
ALTER TABLE "Contract" DROP CONSTRAINT IF EXISTS "Contract_templateId_fkey";

-- DropTable
DROP TABLE IF EXISTS "ContractTemplateVersion";
DROP TABLE IF EXISTS "ContractTemplate";

-- CreateTable
CREATE TABLE "ContractTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contractType" "ContractTemplateType" NOT NULL,
    "description" TEXT,
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL,
    "lastUpdatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL,
    "changeNote" TEXT,

    CONSTRAINT "ContractTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateVariable" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" "TemplateVariableFieldType" NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "defaultValue" TEXT,
    "selectOptions" JSONB,
    "helpText" TEXT,
    "displayOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateVariable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractTemplate_organizationId_idx" ON "ContractTemplate"("organizationId");

-- CreateIndex
CREATE INDEX "ContractTemplate_contractType_idx" ON "ContractTemplate"("contractType");

-- CreateIndex
CREATE INDEX "ContractTemplate_isActive_idx" ON "ContractTemplate"("isActive");

-- CreateIndex
CREATE INDEX "ContractTemplate_isDefault_idx" ON "ContractTemplate"("isDefault");

-- CreateIndex
CREATE INDEX "ContractTemplateVersion_templateId_idx" ON "ContractTemplateVersion"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractTemplateVersion_templateId_version_key" ON "ContractTemplateVersion"("templateId", "version");

-- CreateIndex
CREATE INDEX "TemplateVariable_templateId_idx" ON "TemplateVariable"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateVariable_templateId_name_key" ON "TemplateVariable"("templateId", "name");

-- AddForeignKey
ALTER TABLE "ContractTemplateVersion" ADD CONSTRAINT "ContractTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ContractTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateVariable" ADD CONSTRAINT "TemplateVariable_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ContractTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ContractTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
