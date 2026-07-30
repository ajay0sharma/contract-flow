UPDATE "ContractTypeDefinition"
SET
  "canBeParentAgreement" = true,
  "requiresParentAgreement" = false
WHERE "slug" IN ('vendor', 'customer', 'partnership') AND "isSystem" = true;

UPDATE "ContractTypeDefinition"
SET
  "canBeParentAgreement" = false,
  "requiresParentAgreement" = true
WHERE "slug" IN ('consulting', 'saas') AND "isSystem" = true;

UPDATE "ContractTypeDefinition"
SET
  "canBeParentAgreement" = false,
  "requiresParentAgreement" = false
WHERE "slug" IN ('nda', 'employment', 'other') AND "isSystem" = true;
