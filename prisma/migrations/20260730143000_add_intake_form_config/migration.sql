-- CreateTable
CREATE TABLE "IntakeFormDefinition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntakeFormDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeFormSection" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntakeFormSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeFormField" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" "TemplateVariableFieldType" NOT NULL DEFAULT 'text',
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "helpText" TEXT,
    "placeholder" TEXT,
    "selectOptions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntakeFormField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntakeFormDefinition_organizationId_idx" ON "IntakeFormDefinition"("organizationId");

-- CreateIndex
CREATE INDEX "IntakeFormDefinition_organizationId_isActive_idx" ON "IntakeFormDefinition"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "IntakeFormSection_formId_displayOrder_idx" ON "IntakeFormSection"("formId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeFormSection_formId_key_key" ON "IntakeFormSection"("formId", "key");

-- CreateIndex
CREATE INDEX "IntakeFormField_sectionId_displayOrder_idx" ON "IntakeFormField"("sectionId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeFormField_sectionId_key_key" ON "IntakeFormField"("sectionId", "key");

-- AddForeignKey
ALTER TABLE "IntakeFormSection" ADD CONSTRAINT "IntakeFormSection_formId_fkey" FOREIGN KEY ("formId") REFERENCES "IntakeFormDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeFormField" ADD CONSTRAINT "IntakeFormField_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "IntakeFormSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
