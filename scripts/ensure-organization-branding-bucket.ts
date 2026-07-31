import "dotenv/config";
import { ensureOrganizationBrandingBucket } from "../lib/supabase-storage";

async function main(): Promise<void> {
  await ensureOrganizationBrandingBucket();
  console.log("organization-branding bucket is ready.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
