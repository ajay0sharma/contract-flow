export interface CompanyConfig {
  id: string;
  name: string;
  departments: string[];
  contractTypes: string[];
}

const defaultConfig: CompanyConfig = {
  id: "default",
  name: "Default Company",
  departments: [
    "Legal",
    "Finance",
    "Operations",
    "Sales",
    "Marketing",
    "Human Resources",
    "Engineering",
    "Procurement",
  ],
  contractTypes: [
    "Master Services Agreement",
    "Non-Disclosure Agreement",
    "Statement of Work",
    "Work Order",
    "Change Order",
    "Amendment",
    "Vendor Agreement",
    "Software License",
    "Professional Services",
    "Data Processing Agreement",
  ],
};

const companyConfigs: Record<string, CompanyConfig> = {
  default: defaultConfig,
  acme: {
    id: "acme",
    name: "Acme Corp",
    departments: [
      "Corporate Legal",
      "Global Finance",
      "Revenue Operations",
      "Product Engineering",
      "Strategic Sourcing",
    ],
    contractTypes: [
      "Enterprise MSA",
      "Mutual NDA",
      "Implementation SOW",
    "Work Order",
    "Change Order",
    "Amendment",
      "Cloud Reseller Agreement",
      "Support Renewal",
    ],
  },
};

export function getCompanyConfig(companyId = "default"): CompanyConfig {
  return companyConfigs[companyId] ?? defaultConfig;
}

export function getAvailableCompanyConfigs(): CompanyConfig[] {
  return Object.values(companyConfigs);
}

export function getAllContractTypes(): string[] {
  return Array.from(
    new Set(
      getAvailableCompanyConfigs().flatMap((config) => config.contractTypes),
    ),
  ).sort((a, b) => a.localeCompare(b));
}
