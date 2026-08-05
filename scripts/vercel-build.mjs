import { execSync } from "node:child_process";

function resolveMigrationDatabaseUrl() {
  const directUrl = process.env.DIRECT_DATABASE_URL?.trim();
  if (directUrl) {
    return directUrl;
  }

  const migrateUrl = process.env.MIGRATE_DATABASE_URL?.trim();
  if (migrateUrl) {
    return migrateUrl;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    return null;
  }

  try {
    const url = new URL(databaseUrl);
    const usesPooler =
      url.port === "6543" || url.searchParams.get("pgbouncer") === "true";

    if (usesPooler) {
      console.warn(
        "[vercel-build] DATABASE_URL uses Supabase pooler; skipping prisma migrate deploy.",
      );
      console.warn(
        "[vercel-build] Set DIRECT_DATABASE_URL in Vercel to run migrations during build.",
      );
      return null;
    }
  } catch {
    // Fall through and attempt migrate with DATABASE_URL.
  }

  return databaseUrl;
}

function runMigrateDeploy(databaseUrl) {
  console.log("[vercel-build] Applying database migrations...");
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
    timeout: 120_000,
  });
}

function runProductionBuild() {
  console.log("[vercel-build] Running Next.js production build...");
  execSync("npm run build", {
    stdio: "inherit",
    timeout: 600_000,
  });
}

const migrationDatabaseUrl = resolveMigrationDatabaseUrl();

if (migrationDatabaseUrl) {
  runMigrateDeploy(migrationDatabaseUrl);
} else {
  console.warn(
    "[vercel-build] Continuing without migrations so the deployment can complete.",
  );
}

runProductionBuild();
