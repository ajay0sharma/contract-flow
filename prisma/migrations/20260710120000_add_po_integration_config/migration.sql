-- CreateEnum
CREATE TYPE "PoProvider" AS ENUM ('coupa', 'sap', 'prendio', 'netsuite', 'oracle', 'manual', 'other');

-- CreateEnum
CREATE TYPE "PoAuthType" AS ENUM ('api_key', 'oauth2', 'basic_auth', 'none');

-- CreateTable
CREATE TABLE "PoIntegrationConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "PoProvider" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "displayName" TEXT NOT NULL,
    "baseUrl" TEXT,
    "authType" "PoAuthType" NOT NULL,
    "encryptedCredentials" TEXT,
    "fieldMappings" JSONB,
    "autoPopulateOnMatch" BOOLEAN NOT NULL DEFAULT true,
    "requirePoNumber" BOOLEAN NOT NULL DEFAULT false,
    "allowedContractTypes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PoIntegrationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoLookupLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contractId" TEXT,
    "poNumber" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "responseData" JSONB,
    "errorMessage" TEXT,
    "lookedUpByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PoLookupLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PoIntegrationConfig_organizationId_key" ON "PoIntegrationConfig"("organizationId");

-- CreateIndex
CREATE INDEX "PoIntegrationConfig_organizationId_idx" ON "PoIntegrationConfig"("organizationId");

-- CreateIndex
CREATE INDEX "PoLookupLog_organizationId_idx" ON "PoLookupLog"("organizationId");

-- CreateIndex
CREATE INDEX "PoLookupLog_contractId_idx" ON "PoLookupLog"("contractId");

-- CreateIndex
CREATE INDEX "PoLookupLog_poNumber_idx" ON "PoLookupLog"("poNumber");

-- CreateIndex
CREATE INDEX "PoLookupLog_createdAt_idx" ON "PoLookupLog"("createdAt");
