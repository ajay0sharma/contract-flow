import type { CounterpartyProfile, CreateCounterpartyInput } from "@/lib/counterparty-store";
import type { PlatformRole, PlatformUser } from "@/lib/platform-config";
import {
  getCachedCounterparties,
  getCachedPlatformUsers,
  getCachedWorkflowConfig,
  getCachedWorkflowPolicy,
  invalidateCounterpartyCache,
  isPlatformDataHydrated,
  markPlatformDataHydrated,
  setCachedCounterparties,
  setCachedPlatformUsers,
  setCachedWorkflowConfig,
  setCachedWorkflowPolicy,
} from "@/lib/platform-data-cache";
import { allowMemoryPersistence, requireDatabaseConfigured } from "@/lib/persistence-mode";
import { getPrismaClient } from "@/lib/prisma";
import { defaultWorkflowPolicy, type WorkflowConfig, type WorkflowPolicy } from "@/lib/workflow-config-types";
import {
  getDefaultWorkflowConfig,
} from "@/lib/workflow-store-defaults";

const DEFAULT_PLATFORM_ORGANIZATION_ID = "default";

function toJsonValue<T>(value: T) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function mapPlatformUser(record: {
  email: string;
  name: string;
  role: string;
  createdAt: Date;
}): PlatformUser {
  return {
    email: record.email,
    name: record.name,
    role: record.role as PlatformRole,
    createdAt: record.createdAt.toISOString(),
  };
}

function mapCounterparty(record: {
  id: string;
  name: string;
  mainContactName: string;
  mainContactTitle: string;
  mainContactEmail: string;
  mainContactPhone: string;
  address: string;
  createdAt: Date;
}): CounterpartyProfile {
  return {
    id: record.id,
    name: record.name,
    mainContactName: record.mainContactName,
    mainContactTitle: record.mainContactTitle,
    mainContactEmail: record.mainContactEmail,
    mainContactPhone: record.mainContactPhone,
    address: record.address,
    createdAt: record.createdAt.toISOString(),
  };
}

const seedUsers: PlatformUser[] = [
  {
    email: "as.ops.consulting@gmail.com",
    name: "AS Ops Consulting",
    role: "admin",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
  {
    email: "ajay.sharma.jd@gmail.com",
    name: "Ajay Sharma",
    role: "legal",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
  {
    email: "support@example.com",
    name: "Support User",
    role: "support",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
  {
    email: "marcus@example.com",
    name: "Marcus Chen",
    role: "business",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
  {
    email: "elena@example.com",
    name: "Elena Brooks",
    role: "business",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
  {
    email: "jordan@example.com",
    name: "Jordan Lee",
    role: "business",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
];

const seedCounterparties: CounterpartyProfile[] = [
  {
    id: "cp-acme",
    name: "Acme Corp",
    mainContactName: "Jane Smith",
    mainContactTitle: "Director of Procurement",
    mainContactEmail: "jane@acme.com",
    mainContactPhone: "+1 (415) 555-0142",
    address: "500 Market Street, San Francisco, CA",
    createdAt: "2026-01-15T00:00:00.000Z",
  },
  {
    id: "cp-brightline",
    name: "Brightline Analytics",
    mainContactName: "Alex Kim",
    mainContactTitle: "Head of Partnerships",
    mainContactEmail: "alex@brightline.com",
    mainContactPhone: "+1 (206) 555-0198",
    address: "1200 Pine Street, Seattle, WA",
    createdAt: "2026-02-01T00:00:00.000Z",
  },
  {
    id: "cp-cloudhost",
    name: "CloudHost Pro",
    mainContactName: "Chris Lee",
    mainContactTitle: "Account Executive",
    mainContactEmail: "chris@cloudhost.com",
    mainContactPhone: "",
    address: "44 Cloud Way, Austin, TX",
    createdAt: "2026-02-10T00:00:00.000Z",
  },
  {
    id: "cp-northwind",
    name: "Northwind Labs",
    mainContactName: "Taylor Reed",
    mainContactTitle: "General Counsel",
    mainContactEmail: "taylor@northwind.com",
    mainContactPhone: "+1 (617) 555-0133",
    address: "88 Harbor Road, Boston, MA",
    createdAt: "2026-03-05T00:00:00.000Z",
  },
  {
    id: "cp-atlas",
    name: "Atlas Systems",
    mainContactName: "Morgan Lee",
    mainContactTitle: "VP, Commercial Operations",
    mainContactEmail: "morgan@atlas.com",
    mainContactPhone: "+1 (312) 555-0177",
    address: "300 State Street, Chicago, IL",
    createdAt: "2026-03-20T00:00:00.000Z",
  },
];

async function ensurePlatformDefaults(): Promise<void> {
  const prisma = getPrismaClient();
  const userCount = await prisma.platformUser.count();

  if (userCount === 0) {
    for (const user of seedUsers) {
      await prisma.platformUser.create({
        data: {
          email: user.email,
          name: user.name,
          role: user.role,
          createdAt: new Date(user.createdAt),
        },
      });
    }
  }

  const settings = await prisma.platformWorkflowSettings.findUnique({
    where: { organizationId: DEFAULT_PLATFORM_ORGANIZATION_ID },
  });

  if (!settings) {
    await prisma.platformWorkflowSettings.create({
      data: {
        organizationId: DEFAULT_PLATFORM_ORGANIZATION_ID,
        workflowConfig: toJsonValue(getDefaultWorkflowConfig()),
        workflowPolicy: toJsonValue(defaultWorkflowPolicy),
      },
    });
  }

  const counterpartyCount = await prisma.counterparty.count({
    where: { organizationId: DEFAULT_PLATFORM_ORGANIZATION_ID },
  });

  if (counterpartyCount === 0) {
    for (const profile of seedCounterparties) {
      await prisma.counterparty.create({
        data: {
          id: profile.id,
          organizationId: DEFAULT_PLATFORM_ORGANIZATION_ID,
          name: profile.name,
          mainContactName: profile.mainContactName,
          mainContactTitle: profile.mainContactTitle,
          mainContactEmail: profile.mainContactEmail,
          mainContactPhone: profile.mainContactPhone,
          address: profile.address,
          createdAt: new Date(profile.createdAt),
        },
      });
    }
  }
}

export async function hydratePlatformDataFromDatabase(): Promise<void> {
  if (allowMemoryPersistence() || isPlatformDataHydrated()) {
    return;
  }

  const prisma = getPrismaClient();
  await ensurePlatformDefaults();

  const [users, settings] = await Promise.all([
    prisma.platformUser.findMany({
      orderBy: { createdAt: "desc" },
    }),
    prisma.platformWorkflowSettings.findUnique({
      where: { organizationId: DEFAULT_PLATFORM_ORGANIZATION_ID },
    }),
  ]);

  setCachedPlatformUsers(users.map(mapPlatformUser));

  if (settings) {
    setCachedWorkflowConfig(settings.workflowConfig as unknown as WorkflowConfig);
    setCachedWorkflowPolicy(settings.workflowPolicy as unknown as WorkflowPolicy);
  } else {
    setCachedWorkflowConfig(getDefaultWorkflowConfig());
    setCachedWorkflowPolicy(defaultWorkflowPolicy);
  }

  markPlatformDataHydrated();
}

export async function ensurePlatformDataHydrated(): Promise<void> {
  if (allowMemoryPersistence() || isPlatformDataHydrated()) {
    return;
  }

  await hydratePlatformDataFromDatabase();
}

export async function loadPlatformUsersFromDatabase(): Promise<PlatformUser[]> {
  await ensurePlatformDataHydrated();

  const cached = getCachedPlatformUsers();
  if (cached) {
    return cached;
  }

  const prisma = getPrismaClient();
  const users = await prisma.platformUser.findMany({
    orderBy: { createdAt: "desc" },
  });
  const mapped = users.map(mapPlatformUser);
  setCachedPlatformUsers(mapped);
  return mapped;
}

export async function savePlatformUserToDatabase(user: PlatformUser): Promise<PlatformUser> {
  requireDatabaseConfigured("platform user persistence");
  const prisma = getPrismaClient();
  const normalized = normalizeEmail(user.email);
  const record = await prisma.platformUser.upsert({
    where: { email: normalized },
    create: {
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: new Date(user.createdAt),
    },
    update: {
      name: user.name,
      role: user.role,
    },
  });

  const mapped = mapPlatformUser(record);
  const users = await loadPlatformUsersFromDatabase();
  const nextUsers = [
    mapped,
    ...users.filter((entry) => normalizeEmail(entry.email) !== normalized),
  ];
  setCachedPlatformUsers(nextUsers);
  return mapped;
}

export async function saveWorkflowConfigToDatabase(
  config: WorkflowConfig,
  organizationId = DEFAULT_PLATFORM_ORGANIZATION_ID,
): Promise<void> {
  requireDatabaseConfigured("workflow config persistence");

  const prisma = getPrismaClient();
  const policy =
    getCachedWorkflowPolicy() ??
    ((await prisma.platformWorkflowSettings.findUnique({
      where: { organizationId },
    }))?.workflowPolicy as unknown as WorkflowPolicy | undefined) ??
    defaultWorkflowPolicy;

  await prisma.platformWorkflowSettings.upsert({
    where: { organizationId },
    create: {
      organizationId,
      workflowConfig: toJsonValue(config),
      workflowPolicy: toJsonValue(policy),
    },
    update: {
      workflowConfig: toJsonValue(config),
    },
  });

  setCachedWorkflowConfig(config);
}

export async function saveWorkflowPolicyToDatabase(
  policy: WorkflowPolicy,
  organizationId = DEFAULT_PLATFORM_ORGANIZATION_ID,
): Promise<void> {
  requireDatabaseConfigured("workflow policy persistence");

  const prisma = getPrismaClient();
  const config =
    getCachedWorkflowConfig() ??
    ((await prisma.platformWorkflowSettings.findUnique({
      where: { organizationId },
    }))?.workflowConfig as unknown as WorkflowConfig | undefined) ??
    getDefaultWorkflowConfig();

  await prisma.platformWorkflowSettings.upsert({
    where: { organizationId },
    create: {
      organizationId,
      workflowConfig: toJsonValue(config),
      workflowPolicy: toJsonValue(policy),
    },
    update: {
      workflowPolicy: toJsonValue(policy),
    },
  });

  setCachedWorkflowPolicy(policy);
}

export async function loadCounterpartiesFromDatabase(
  organizationId: string,
): Promise<CounterpartyProfile[]> {
  const cached = getCachedCounterparties(organizationId);
  if (cached) {
    return cached;
  }

  if (allowMemoryPersistence()) {
    return [];
  }

  await ensurePlatformDataHydrated();
  const prisma = getPrismaClient();
  const records = await prisma.counterparty.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
  });
  const mapped = records.map(mapCounterparty);
  setCachedCounterparties(organizationId, mapped);
  return mapped;
}

export async function createCounterpartyInDatabase(
  organizationId: string,
  input: CreateCounterpartyInput,
): Promise<CounterpartyProfile> {
  requireDatabaseConfigured("counterparty persistence");

  const prisma = getPrismaClient();
  const { safeTrim } = await import("@/lib/string-utils");
  const record = await prisma.counterparty.create({
    data: {
      organizationId,
      name: safeTrim(input.name),
      mainContactName: safeTrim(input.mainContactName),
      mainContactTitle: safeTrim(input.mainContactTitle),
      mainContactEmail: safeTrim(input.mainContactEmail),
      mainContactPhone: safeTrim(input.mainContactPhone),
      address: safeTrim(input.address),
    },
  });

  invalidateCounterpartyCache(organizationId);
  return mapCounterparty(record);
}
