import type { PlatformRole, PlatformUser } from "@/lib/platform-config";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
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

const globalStore = globalThis as typeof globalThis & {
  __platformUsers?: PlatformUser[];
};

function getStore(): PlatformUser[] {
  if (!globalStore.__platformUsers) {
    globalStore.__platformUsers = [...seedUsers];
  }

  return globalStore.__platformUsers;
}

export function getPlatformUsers(): PlatformUser[] {
  return [...getStore()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function getPlatformUser(email: string): PlatformUser | undefined {
  const normalized = normalizeEmail(email);

  return getStore().find(
    (user) => normalizeEmail(user.email) === normalized,
  );
}

export function upsertPlatformUser(user: PlatformUser): PlatformUser {
  const store = getStore();
  const normalized = normalizeEmail(user.email);
  const index = store.findIndex(
    (entry) => normalizeEmail(entry.email) === normalized,
  );

  if (index === -1) {
    store.unshift(user);
    return user;
  }

  store[index] = user;
  return user;
}

export function updatePlatformUserRole(
  email: string,
  role: PlatformRole,
): PlatformUser {
  const existing = getPlatformUser(email);

  if (!existing) {
    throw new Error("User not found in platform registry.");
  }

  return upsertPlatformUser({ ...existing, role });
}
