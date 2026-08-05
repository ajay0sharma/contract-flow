import {
  getCachedPlatformUsers,
} from "@/lib/platform-data-cache";
import { allowMemoryPersistence } from "@/lib/persistence-mode";
import type { PlatformUser } from "@/lib/platform-config";

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

function getMemoryStore(): PlatformUser[] {
  if (!globalStore.__platformUsers) {
    globalStore.__platformUsers = [...seedUsers];
  }

  return globalStore.__platformUsers;
}

function sortUsers(users: PlatformUser[]): PlatformUser[] {
  return [...users].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function getPlatformUsers(): PlatformUser[] {
  if (allowMemoryPersistence()) {
    return sortUsers(getMemoryStore());
  }

  const cached = getCachedPlatformUsers();
  return cached ? sortUsers(cached) : [];
}

export function getPlatformUser(email: string): PlatformUser | undefined {
  const normalized = email.trim().toLowerCase();
  return getPlatformUsers().find(
    (user) => user.email.trim().toLowerCase() === normalized,
  );
}
