import { execSync } from "node:child_process";

function deriveDirectPostgresUrl(databaseUrl) {
  try {
    const url = new URL(databaseUrl);
    const usesPooler =
      url.port === "6543" || url.searchParams.get("pgbouncer") === "true";

    if (!usesPooler) {
      return databaseUrl;
    }

    url.port = "5432";
    url.searchParams.delete("pgbouncer");
    console.warn(
      "[vercel-build] Using direct Postgres port 5432 for migrations.",
    );
    return url.toString();
  } catch {
    return databaseUrl;
  }
}

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

  return deriveDirectPostgresUrl(databaseUrl);
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
  try {
    runMigrateDeploy(migrationDatabaseUrl);
  } catch (error) {
    console.error(
      "[vercel-build] Migration step failed; continuing with app build.",
    );
    console.error(
      error instanceof Error ? error.message : "Unknown migration error.",
    );
  }
} else {
  console.warn(
    "[vercel-build] DATABASE_URL is not configured; skipping migrations.",
  );
}

runProductionBuild();
