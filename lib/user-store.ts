import {
  setCachedPlatformUsers,
} from "@/lib/platform-data-cache";
import { allowMemoryPersistence } from "@/lib/persistence-mode";
import type { PlatformRole, PlatformUser } from "@/lib/platform-config";
import {
  getPlatformUser,
  getPlatformUsers,
} from "@/lib/platform-user-read";

export { getPlatformUser, getPlatformUsers } from "@/lib/platform-user-read";

export async function upsertPlatformUser(user: PlatformUser): Promise<PlatformUser> {
  if (allowMemoryPersistence()) {
    const globalStore = globalThis as typeof globalThis & {
      __platformUsers?: PlatformUser[];
    };

    if (!globalStore.__platformUsers) {
      globalStore.__platformUsers = getPlatformUsers();
    }

    const store = globalStore.__platformUsers;
    const normalized = user.email.trim().toLowerCase();
    const index = store.findIndex(
      (entry) => entry.email.trim().toLowerCase() === normalized,
    );

    if (index === -1) {
      store.unshift(user);
      return user;
    }

    store[index] = user;
    return user;
  }

  const { savePlatformUserToDatabase } = await import("@/lib/platform-data-db");
  return savePlatformUserToDatabase(user);
}

export async function updatePlatformUserRole(
  email: string,
  role: PlatformRole,
): Promise<PlatformUser> {
  const existing = getPlatformUser(email);

  if (!existing) {
    throw new Error("User not found in platform registry.");
  }

  return upsertPlatformUser({ ...existing, role });
}

export async function hydratePlatformUsersCache(): Promise<void> {
  if (allowMemoryPersistence()) {
    return;
  }

  const { loadPlatformUsersFromDatabase } = await import("@/lib/platform-data-db");
  const users = await loadPlatformUsersFromDatabase();
  setCachedPlatformUsers(users);
}
