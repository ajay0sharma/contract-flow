-- CreateTable
CREATE TABLE "ContractTypeDefinition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractTypeDefinition_pkey" PRIMARY KEY ("id")
);

-- Convert template contractType from enum to text
ALTER TABLE "ContractTemplate" ALTER COLUMN "contractType" TYPE TEXT USING "contractType"::TEXT;

-- DropEnum
DROP TYPE "ContractTemplateType";

-- CreateIndex
CREATE UNIQUE INDEX "ContractTypeDefinition_organizationId_slug_key" ON "ContractTypeDefinition"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "ContractTypeDefinition_organizationId_isActive_idx" ON "ContractTypeDefinition"("organizationId", "isActive");

-- Seed system contract types for the default organization
INSERT INTO "ContractTypeDefinition" ("id", "organizationId", "slug", "label", "description", "displayOrder", "isActive", "isSystem", "createdById", "createdAt", "updatedAt")
VALUES
  ('ctype-vendor', 'default', 'vendor', 'Vendor', 'Master agreements and vendor/supplier contracts.', 0, true, true, 'system', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ctype-customer', 'default', 'customer', 'Customer', 'Customer SOWs, work orders, and service agreements.', 1, true, true, 'system', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ctype-nda', 'default', 'nda', 'NDA', 'Mutual or one-way non-disclosure agreements.', 2, true, true, 'system', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ctype-employment', 'default', 'employment', 'Employment', 'Employment offers and contractor agreements.', 3, true, true, 'system', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ctype-saas', 'default', 'saas', 'SaaS', 'Software subscription and license agreements.', 4, true, true, 'system', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ctype-consulting', 'default', 'consulting', 'Consulting', 'Professional services and consulting engagements.', 5, true, true, 'system', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ctype-partnership', 'default', 'partnership', 'Partnership', 'Strategic partnership and reseller agreements.', 6, true, true, 'system', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ctype-other', 'default', 'other', 'Other', 'General-purpose or custom agreement templates.', 7, true, true, 'system', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
