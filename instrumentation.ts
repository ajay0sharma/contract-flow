export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { isDatabaseConfigured } = await import("@/lib/prisma");

  if (!isDatabaseConfigured()) {
    return;
  }

  const { hydratePlatformDataFromDatabase } = await import("@/lib/platform-data-db");
  await hydratePlatformDataFromDatabase();
}
