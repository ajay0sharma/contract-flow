CREATE TABLE "OrganizationEmailConfig" (
    "organizationId" TEXT NOT NULL,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "outboundWebhookUrl" TEXT,
    "encryptedWebhookSecret" TEXT,
    "mailboxEmails" JSONB,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationEmailConfig_pkey" PRIMARY KEY ("organizationId")
);
