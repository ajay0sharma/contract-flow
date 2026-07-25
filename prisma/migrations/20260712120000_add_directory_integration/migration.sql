-- CreateEnum
CREATE TYPE "DirectoryProvider" AS ENUM ('microsoft', 'google', 'manual');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('never_synced', 'syncing', 'success', 'failed');

-- CreateTable
CREATE TABLE "DirectoryIntegrationConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "DirectoryProvider" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "displayName" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" "SyncStatus" NOT NULL DEFAULT 'never_synced',
    "lastSyncCount" INTEGER,
    "lastSyncError" TEXT,
    "autoSyncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoSyncIntervalHours" INTEGER NOT NULL DEFAULT 24,
    "encryptedCredentials" TEXT NOT NULL,
    "scopeFilter" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectoryIntegrationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectoryUser" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "jobTitle" TEXT,
    "department" TEXT,
    "officeLocation" TEXT,
    "phone" TEXT,
    "managerEmail" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "provider" "DirectoryProvider" NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectoryUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DirectoryIntegrationConfig_organizationId_key" ON "DirectoryIntegrationConfig"("organizationId");

-- CreateIndex
CREATE INDEX "DirectoryIntegrationConfig_organizationId_idx" ON "DirectoryIntegrationConfig"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "DirectoryUser_organizationId_externalId_key" ON "DirectoryUser"("organizationId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "DirectoryUser_organizationId_email_key" ON "DirectoryUser"("organizationId", "email");

-- CreateIndex
CREATE INDEX "DirectoryUser_organizationId_idx" ON "DirectoryUser"("organizationId");

-- CreateIndex
CREATE INDEX "DirectoryUser_email_idx" ON "DirectoryUser"("email");

-- CreateIndex
CREATE INDEX "DirectoryUser_department_idx" ON "DirectoryUser"("department");

-- CreateIndex
CREATE INDEX "DirectoryUser_isActive_idx" ON "DirectoryUser"("isActive");

-- CreateIndex
CREATE INDEX "DirectoryUser_displayName_idx" ON "DirectoryUser"("displayName");
