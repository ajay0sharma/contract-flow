import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const globalForSupabase = globalThis as typeof globalThis & {
  supabaseAdmin?: SupabaseClient;
};

export const CONTRACT_TEMPLATES_BUCKET = "contract-templates";
export const CONTRACT_DOCUMENTS_BUCKET = "contract-documents";
export const ORGANIZATION_BRANDING_BUCKET = "organization-branding";
export const MAX_TEMPLATE_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_EXECUTED_DOCUMENT_BYTES = 50 * 1024 * 1024;
export const MAX_CONTRACT_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ORGANIZATION_LOGO_BYTES = 2 * 1024 * 1024;

export function formatTemplateFileSizeMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export function validateTemplateFileSize(
  sizeBytes: number,
): string | null {
  if (sizeBytes <= MAX_TEMPLATE_FILE_BYTES) {
    return null;
  }

  return `This file is ${formatTemplateFileSizeMb(sizeBytes)}MB. Template documents must be under 25MB. Please reduce the file size and try again.`;
}

export function isSupabaseStorageConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseServiceRoleKey());
}

export function getSupabaseStorageMissingConfig(): string[] {
  const missing: string[] = [];

  if (!getSupabaseUrl()) {
    missing.push(
      "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL (auto-derived from DATABASE_URL when using Supabase Postgres)",
    );
  }

  if (!getSupabaseServiceRoleKey()) {
    missing.push(
      "SUPABASE_SERVICE_ROLE_KEY (Supabase → Project Settings → API → service_role secret)",
    );
  }

  return missing;
}

export function getSupabaseStorageSetupMessage(): string {
  const missing = getSupabaseStorageMissingConfig();

  if (missing.length === 0) {
    return "";
  }

  return `Template storage is not configured. Add to .env.local: ${missing.join("; ")}. Then restart the dev server.`;
}

function deriveSupabaseUrlFromDatabaseUrl(): string | undefined {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    return undefined;
  }

  try {
    const normalized = databaseUrl.replace(/^postgresql:/i, "postgres:");
    const url = new URL(normalized);
    const hostMatch = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);

    if (hostMatch?.[1]) {
      return `https://${hostMatch[1]}.supabase.co`;
    }

    const userMatch = url.username.match(/^postgres\.([a-z0-9]+)$/i);

    if (userMatch?.[1]) {
      return `https://${userMatch[1]}.supabase.co`;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function getSupabaseUrl(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    deriveSupabaseUrlFromDatabaseUrl() ||
    undefined
  );
}

function getSupabaseServiceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined;
}

export function getSupabaseAdminClient(): SupabaseClient {
  if (globalForSupabase.supabaseAdmin) {
    return globalForSupabase.supabaseAdmin;
  }

  const url = getSupabaseUrl();
  const serviceRoleKey = getSupabaseServiceRoleKey();

  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) is not set in environment variables.",
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set in environment variables. This key is required for file uploads. Find it in your Supabase dashboard under Settings → API → Service role secret.",
    );
  }

  const client = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  globalForSupabase.supabaseAdmin = client;
  return client;
}

export async function ensureContractTemplatesBucket(): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();

  if (listError) {
    throw new Error(`Unable to list storage buckets: ${listError.message}`);
  }

  const exists = buckets.some((bucket) => bucket.name === CONTRACT_TEMPLATES_BUCKET);

  if (exists) {
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(
    CONTRACT_TEMPLATES_BUCKET,
    {
      public: false,
      fileSizeLimit: MAX_TEMPLATE_FILE_BYTES,
    },
  );

  if (createError) {
    throw new Error(
      `Unable to create ${CONTRACT_TEMPLATES_BUCKET} bucket: ${createError.message}`,
    );
  }
}

export function buildTemplateStoragePath(
  organizationId: string,
  templateId: string,
  version: number,
  fileName: string,
): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${organizationId}/${templateId}/v${version}/${safeName}`;
}

export async function uploadTemplateFile(
  storagePath: string,
  fileBuffer: Buffer,
  contentType: string,
): Promise<void> {
  await ensureContractTemplatesBucket();

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.storage
    .from(CONTRACT_TEMPLATES_BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Template upload failed: ${error.message}`);
  }
}

export async function createTemplateSignedDownloadUrl(
  storagePath: string,
  expiresInSeconds = 300,
): Promise<string> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(CONTRACT_TEMPLATES_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(
      error?.message ?? "Unable to create a signed download URL for the template.",
    );
  }

  return data.signedUrl;
}

export async function ensureContractDocumentsBucket(): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();

  if (listError) {
    throw new Error(`Unable to list storage buckets: ${listError.message}`);
  }

  const exists = buckets.some((bucket) => bucket.name === CONTRACT_DOCUMENTS_BUCKET);

  if (exists) {
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(
    CONTRACT_DOCUMENTS_BUCKET,
    {
      public: false,
      fileSizeLimit: MAX_EXECUTED_DOCUMENT_BYTES,
    },
  );

  if (createError) {
    throw new Error(
      `Unable to create ${CONTRACT_DOCUMENTS_BUCKET} bucket: ${createError.message}`,
    );
  }
}

export function buildExecutedDocumentStoragePath(
  organizationId: string,
  contractId: string,
  fileName: string,
): string {
  const timestamp = Date.now();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `contracts/${organizationId}/${contractId}/executed/${timestamp}-${safeName}`;
}

export function buildGeneratedDraftStoragePath(
  organizationId: string,
  contractId: string,
  fileName: string,
): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `contracts/${organizationId}/${contractId}/draft/${safeName}`;
}

export function buildContractAttachmentStoragePath(
  organizationId: string,
  contractId: string,
  attachmentId: string,
  fileName: string,
): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `contracts/${organizationId}/${contractId}/attachments/${attachmentId}/${safeName}`;
}

export function buildLegalReviewRedlineStoragePath(
  organizationId: string,
  contractId: string,
  roundId: string,
  fileName: string,
): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `contracts/${organizationId}/${contractId}/legal-review/${roundId}/${safeName}`;
}

export async function uploadContractAttachment(
  storagePath: string,
  fileBuffer: Buffer,
  contentType: string,
): Promise<void> {
  await uploadExecutedDocument(storagePath, fileBuffer, contentType);
}

export async function downloadContractAttachment(
  storagePath: string,
): Promise<Buffer> {
  return downloadExecutedDocument(storagePath);
}

export async function createContractAttachmentSignedUrl(
  storagePath: string,
  expiresInSeconds = 1800,
): Promise<string> {
  return createExecutedDocumentSignedUrl(storagePath, expiresInSeconds);
}

export async function uploadGeneratedDraftDocument(
  storagePath: string,
  fileBuffer: Buffer,
  contentType: string,
): Promise<void> {
  await uploadExecutedDocument(storagePath, fileBuffer, contentType);
}

export async function uploadExecutedDocument(
  storagePath: string,
  fileBuffer: Buffer,
  contentType: string,
): Promise<void> {
  await ensureContractDocumentsBucket();

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.storage
    .from(CONTRACT_DOCUMENTS_BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Executed document upload failed: ${error.message}`);
  }
}

export async function downloadExecutedDocument(storagePath: string): Promise<Buffer> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(CONTRACT_DOCUMENTS_BUCKET)
    .download(storagePath);

  if (error || !data) {
    throw new Error(
      error?.message ?? "Unable to download the executed document from storage.",
    );
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function downloadTemplateDocument(
  storagePath: string,
): Promise<Buffer> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(CONTRACT_TEMPLATES_BUCKET)
    .download(storagePath);

  if (error || !data) {
    throw new Error(
      error?.message ?? "Unable to download the template document from storage.",
    );
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function createExecutedDocumentSignedUrl(
  storagePath: string,
  expiresInSeconds = 1800,
): Promise<string> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(CONTRACT_DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(
      error?.message ?? "Unable to create a signed download URL for the executed document.",
    );
  }

  return data.signedUrl;
}

export async function ensureOrganizationBrandingBucket(): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();

  if (listError) {
    throw new Error(`Unable to list storage buckets: ${listError.message}`);
  }

  const exists = buckets.some((bucket) => bucket.name === ORGANIZATION_BRANDING_BUCKET);

  if (exists) {
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(
    ORGANIZATION_BRANDING_BUCKET,
    {
      public: false,
      fileSizeLimit: MAX_ORGANIZATION_LOGO_BYTES,
    },
  );

  if (createError) {
    throw new Error(
      `Unable to create ${ORGANIZATION_BRANDING_BUCKET} bucket: ${createError.message}`,
    );
  }
}

export function buildOrganizationBrandingStoragePath(
  organizationId: string,
  fileName: string,
): string {
  const timestamp = Date.now();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${organizationId}/logo/${timestamp}-${safeName}`;
}

export async function uploadOrganizationBrandingLogo(
  organizationId: string,
  fileName: string,
  fileBuffer: Buffer,
  contentType: string,
): Promise<{ storagePath: string; fileName: string }> {
  await ensureOrganizationBrandingBucket();

  const storagePath = buildOrganizationBrandingStoragePath(
    organizationId,
    fileName,
  );
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.storage
    .from(ORGANIZATION_BRANDING_BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Logo upload failed: ${error.message}`);
  }

  return { storagePath, fileName };
}

export async function deleteOrganizationBrandingLogo(
  storagePath: string,
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.storage
    .from(ORGANIZATION_BRANDING_BUCKET)
    .remove([storagePath]);

  if (error) {
    throw new Error(`Logo delete failed: ${error.message}`);
  }
}

export async function createOrganizationBrandingSignedUrl(
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(ORGANIZATION_BRANDING_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(
      error?.message ?? "Unable to create a signed URL for the organization logo.",
    );
  }

  return data.signedUrl;
}
