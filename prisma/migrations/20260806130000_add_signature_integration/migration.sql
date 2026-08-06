-- CreateEnum
CREATE TYPE "SignatureProvider" AS ENUM ('docusign', 'dropbox_sign', 'adobe_sign', 'webhook_bridge', 'manual');

-- CreateEnum
CREATE TYPE "SignatureEnvelopeStatus" AS ENUM ('draft', 'sent', 'delivered', 'completed', 'declined', 'voided', 'failed');

-- CreateTable
CREATE TABLE "SignatureIntegrationConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "SignatureProvider" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "displayName" TEXT NOT NULL,
    "accountId" TEXT,
    "baseUrl" TEXT,
    "encryptedCredentials" TEXT,
    "encryptedWebhookSecret" TEXT,
    "autoActivateOnComplete" BOOLEAN NOT NULL DEFAULT true,
    "reminderDays" INTEGER NOT NULL DEFAULT 3,
    "settings" JSONB,
    "lastTestAt" TIMESTAMP(3),
    "lastTestStatus" TEXT,
    "lastTestError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignatureIntegrationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignatureEnvelope" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "provider" "SignatureProvider" NOT NULL,
    "externalEnvelopeId" TEXT,
    "status" "SignatureEnvelopeStatus" NOT NULL DEFAULT 'draft',
    "subject" TEXT,
    "signers" JSONB NOT NULL DEFAULT '[]',
    "documentName" TEXT,
    "sentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "sentByEmail" TEXT,
    "sentByName" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignatureEnvelope_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SignatureIntegrationConfig_organizationId_key" ON "SignatureIntegrationConfig"("organizationId");

-- CreateIndex
CREATE INDEX "SignatureIntegrationConfig_organizationId_idx" ON "SignatureIntegrationConfig"("organizationId");

-- CreateIndex
CREATE INDEX "SignatureEnvelope_organizationId_idx" ON "SignatureEnvelope"("organizationId");

-- CreateIndex
CREATE INDEX "SignatureEnvelope_contractId_idx" ON "SignatureEnvelope"("contractId");

-- CreateIndex
CREATE INDEX "SignatureEnvelope_externalEnvelopeId_idx" ON "SignatureEnvelope"("externalEnvelopeId");

-- CreateIndex
CREATE INDEX "SignatureEnvelope_status_idx" ON "SignatureEnvelope"("status");

-- CreateIndex
CREATE INDEX "SignatureEnvelope_createdAt_idx" ON "SignatureEnvelope"("createdAt");

-- AddForeignKey
ALTER TABLE "SignatureEnvelope" ADD CONSTRAINT "SignatureEnvelope_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
