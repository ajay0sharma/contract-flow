export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function allowMemoryPersistence(): boolean {
  return !isDatabaseConfigured();
}

export function requireDatabaseConfigured(scope: string): void {
  if (!isDatabaseConfigured()) {
    throw new Error(
      `Database persistence is required for ${scope}. Configure DATABASE_URL.`,
    );
  }
}

export function assertMemoryPersistenceAllowed(scope: string): void {
  if (!allowMemoryPersistence()) {
    throw new Error(
      `${scope} is only available when DATABASE_URL is not configured. Use the database-backed APIs instead.`,
    );
  }
}

export function shouldUseDatabasePersistence(): boolean {
  return isDatabaseConfigured();
}
