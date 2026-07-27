ALTER TABLE "ContractTypeDefinition"
ADD COLUMN "canBeParentAgreement" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "requiresParentAgreement" BOOLEAN NOT NULL DEFAULT false;
