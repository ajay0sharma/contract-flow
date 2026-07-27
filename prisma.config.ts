import { config } from "dotenv";
import { resolve } from "node:path";
import { defineConfig } from "prisma/config";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node --import tsx prisma/seed.ts",
  },
  datasource: {
    // Placeholder allows `prisma generate` during npm install when DATABASE_URL
    // is not set yet. Migrations and runtime still require a real DATABASE_URL.
    url:
      process.env.DATABASE_URL?.trim() ||
      "postgresql://build:build@127.0.0.1:5432/build",
  },
});
