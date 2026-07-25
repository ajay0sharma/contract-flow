-- CreateTable
CREATE TABLE "OrganizationBranding" (
    "organizationId" TEXT NOT NULL,
    "productName" TEXT NOT NULL DEFAULT 'ContractFlow',
    "tagline" TEXT,
    "accentColor" TEXT,
    "logoStoragePath" TEXT,
    "logoFileName" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationBranding_pkey" PRIMARY KEY ("organizationId")
);
