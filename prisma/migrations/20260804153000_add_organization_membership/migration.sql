-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "departments" JSONB NOT NULL,
    "contractTypes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMembership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganizationMembership_userEmail_idx" ON "OrganizationMembership"("userEmail");

-- CreateIndex
CREATE INDEX "OrganizationMembership_organizationId_idx" ON "OrganizationMembership"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMembership_organizationId_userEmail_key" ON "OrganizationMembership"("organizationId", "userEmail");

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed organizations
INSERT INTO "Organization" ("id", "name", "status", "departments", "contractTypes", "updatedAt")
VALUES
  (
    'default',
    'Default Company',
    'active',
    '["Legal","Finance","Operations","Sales","Marketing","Human Resources","Engineering","Procurement"]'::jsonb,
    '["Master Services Agreement","Non-Disclosure Agreement","Statement of Work","Work Order","Change Order","Amendment","Vendor Agreement","Software License","Professional Services","Data Processing Agreement"]'::jsonb,
    CURRENT_TIMESTAMP
  ),
  (
    'acme',
    'Acme Corp',
    'active',
    '["Corporate Legal","Global Finance","Revenue Operations","Product Engineering","Strategic Sourcing"]'::jsonb,
    '["Enterprise MSA","Mutual NDA","Implementation SOW","Work Order","Change Order","Amendment","Cloud Reseller Agreement","Support Renewal"]'::jsonb,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("id") DO NOTHING;

-- Seed memberships
INSERT INTO "OrganizationMembership" ("id", "organizationId", "userEmail", "role", "isDefault", "updatedAt")
VALUES
  ('orgmem-default-admin', 'default', 'as.ops.consulting@gmail.com', 'admin', true, CURRENT_TIMESTAMP),
  ('orgmem-acme-admin', 'acme', 'as.ops.consulting@gmail.com', 'admin', false, CURRENT_TIMESTAMP),
  ('orgmem-default-legal', 'default', 'ajay.sharma.jd@gmail.com', 'legal', true, CURRENT_TIMESTAMP),
  ('orgmem-default-support', 'default', 'support@example.com', 'support', true, CURRENT_TIMESTAMP),
  ('orgmem-default-marcus', 'default', 'marcus@example.com', 'business', true, CURRENT_TIMESTAMP),
  ('orgmem-default-elena', 'default', 'elena@example.com', 'business', true, CURRENT_TIMESTAMP),
  ('orgmem-default-jordan', 'default', 'jordan@example.com', 'business', true, CURRENT_TIMESTAMP)
ON CONFLICT ("organizationId", "userEmail") DO NOTHING;
