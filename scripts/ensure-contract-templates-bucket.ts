import "dotenv/config";
import { ensureContractTemplatesBucket } from "../lib/supabase-storage";

async function main(): Promise<void> {
  await ensureContractTemplatesBucket();
  console.log("contract-templates bucket is ready.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
