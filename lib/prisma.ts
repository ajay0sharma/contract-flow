import { PrismaPg } from "@prisma/adapter-pg";
import { Pool, type PoolConfig } from "pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import type { ConnectionOptions } from "tls";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
  prismaPool?: Pool;
};

function shouldRejectUnauthorized(hostname: string): boolean {
  if (process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true") {
    return true;
  }

  if (process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "false") {
    return false;
  }

  return !hostname.includes("supabase.com") && !hostname.includes("supabase.co");
}

function buildPoolConfig(connectionString: string): PoolConfig {
  const url = new URL(connectionString);
  const sslmode = url.searchParams.get("sslmode");

  // pg v8 maps sslmode=require in the URI to verify-full, which ignores
  // PoolConfig.ssl.rejectUnauthorized. Handle TLS explicitly instead.
  url.searchParams.delete("sslmode");

  const hostname = url.hostname;
  const useSsl =
    sslmode !== "disable" &&
    (Boolean(sslmode) ||
      hostname.includes("supabase.com") ||
      hostname.includes("supabase.co"));

  const config: PoolConfig = {
    connectionString: url.toString(),
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
  };

  if (useSsl) {
    config.ssl = {
      rejectUnauthorized: shouldRejectUnauthorized(hostname),
    } satisfies ConnectionOptions;
  }

  return config;
}

function getDatabaseUrl(): string {
  const connectionString = process.env.DATABASE_URL?.trim();

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not configured. Add it to .env.local. In Supabase: Settings → Database → Connection string → URI mode.",
    );
  }

  return connectionString;
}

function isValidPrismaClient(client: unknown): client is PrismaClient {
  if (client == null || typeof client !== "object") {
    return false;
  }

  const prismaClient = client as PrismaClient;
  const templateDelegate = prismaClient.contractTemplate;
  const contractTypeDelegate = prismaClient.contractTypeDefinition;

  return (
    typeof templateDelegate?.findMany === "function" &&
    typeof contractTypeDelegate?.upsert === "function"
  );
}

function getOrCreatePool(connectionString: string): Pool {
  if (globalForPrisma.prismaPool) {
    return globalForPrisma.prismaPool;
  }

  const pool = new Pool(buildPoolConfig(connectionString));
  globalForPrisma.prismaPool = pool;
  return pool;
}

function createPrismaClient(): PrismaClient {
  const connectionString = getDatabaseUrl();
  const adapter = new PrismaPg(getOrCreatePool(connectionString));
  const client = new PrismaClient({ adapter });

  if (!isValidPrismaClient(client)) {
    throw new Error(
      "Prisma client is missing expected models. Run `npx prisma generate` and restart the dev server.",
    );
  }

  return client;
}

export function getPrismaClient(): PrismaClient {
  if (globalForPrisma.prisma && !isValidPrismaClient(globalForPrisma.prisma)) {
    globalForPrisma.prisma = undefined;
  }

  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  const client = createPrismaClient();
  globalForPrisma.prisma = client;
  return client;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}
