import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import type { PoIntegrationConfig } from "@/lib/generated/prisma/client";
import { Prisma } from "@/lib/generated/prisma/client";
import { reportError } from "@/lib/error-reporting";
import { getPrismaClient } from "@/lib/prisma";
import type {
  IntakePoConfig,
  PoLineItem,
  PoLookupResult,
} from "@/types/po-integration";
import { mapPoResultToFormFields } from "@/types/po-integration";

export type { IntakePoConfig, PoLineItem, PoLookupResult };
export { mapPoResultToFormFields };

type FieldMappings = Record<string, string>;

const GCM_IV_LENGTH = 12;
const GCM_AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.PO_ENCRYPTION_KEY?.trim();

  if (!key) {
    throw new Error("PO_ENCRYPTION_KEY is not configured");
  }

  if (/^[0-9a-fA-F]{64}$/.test(key)) {
    return Buffer.from(key, "hex");
  }

  if (Buffer.byteLength(key, "utf8") === 32) {
    return Buffer.from(key, "utf8");
  }

  throw new Error(
    "PO_ENCRYPTION_KEY must be a 32-byte value (64-character hex string)",
  );
}

export function encryptCredentials(
  credentials: Record<string, string>,
): string {
  const key = getEncryptionKey();
  const iv = randomBytes(GCM_IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = JSON.stringify(credentials);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, authTag, encrypted]);

  return payload.toString("base64");
}

export function decryptCredentials(
  encrypted: string,
): Record<string, string> {
  const key = getEncryptionKey();
  const payload = Buffer.from(encrypted, "base64");

  if (payload.length <= GCM_IV_LENGTH + GCM_AUTH_TAG_LENGTH) {
    throw new Error("Encrypted credentials payload is invalid");
  }

  const iv = payload.subarray(0, GCM_IV_LENGTH);
  const authTag = payload.subarray(
    GCM_IV_LENGTH,
    GCM_IV_LENGTH + GCM_AUTH_TAG_LENGTH,
  );
  const ciphertext = payload.subarray(GCM_IV_LENGTH + GCM_AUTH_TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");

  const parsed = JSON.parse(decrypted) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Decrypted credentials must be a JSON object");
  }

  return Object.fromEntries(
    Object.entries(parsed).map(([entryKey, entryValue]) => [
      entryKey,
      String(entryValue),
    ]),
  );
}

function emptyPoLookupResult(poNumber: string): PoLookupResult {
  return {
    found: false,
    poNumber,
    vendor: null,
    amount: null,
    currency: null,
    description: null,
    requestedBy: null,
    approvedBy: null,
    department: null,
    costCenter: null,
    lineItems: null,
    rawData: {},
  };
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function getByPath(
  source: Record<string, unknown>,
  path: string,
): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, source);
}

function applyFieldMappings(
  result: PoLookupResult,
  mappings: FieldMappings | null | undefined,
): PoLookupResult {
  if (!mappings || Object.keys(mappings).length === 0) {
    return result;
  }

  const next: PoLookupResult = { ...result };

  for (const [sourceField, targetField] of Object.entries(mappings)) {
    const value = getByPath(result.rawData, sourceField);

    switch (targetField) {
      case "poNumber":
        next.poNumber = toStringOrNull(value) ?? next.poNumber;
        break;
      case "vendor":
        next.vendor = toStringOrNull(value);
        break;
      case "amount":
      case "contractValue":
        next.amount = toNumber(value);
        break;
      case "currency":
        next.currency = toStringOrNull(value);
        break;
      case "description":
        next.description = toStringOrNull(value);
        break;
      case "requestedBy":
        next.requestedBy = toStringOrNull(value);
        break;
      case "approvedBy":
        next.approvedBy = toStringOrNull(value);
        break;
      case "department":
        next.department = toStringOrNull(value);
        break;
      case "costCenter":
        next.costCenter = toStringOrNull(value);
        break;
      default:
        break;
    }
  }

  next.found = Boolean(
    next.vendor ||
      next.amount !== null ||
      next.description ||
      next.requestedBy ||
      next.department,
  );

  return next;
}

function requireBaseUrl(config: PoIntegrationConfig): string {
  const baseUrl = config.baseUrl?.trim();

  if (!baseUrl) {
    throw new Error(
      `PO integration for ${config.displayName} is missing baseUrl configuration`,
    );
  }

  return baseUrl.replace(/\/$/, "");
}

function requireEncryptedCredentials(
  config: PoIntegrationConfig,
): Record<string, string> {
  if (!config.encryptedCredentials?.trim()) {
    throw new Error(
      `PO integration for ${config.displayName} is missing encrypted credentials`,
    );
  }

  return decryptCredentials(config.encryptedCredentials);
}

async function fetchJson(
  url: string,
  init: RequestInit,
  providerLabel: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...init.headers,
    },
  });

  const bodyText = await response.text();
  let parsed: unknown = {};

  if (bodyText.trim()) {
    try {
      parsed = JSON.parse(bodyText) as unknown;
    } catch {
      throw new Error(
        `${providerLabel} returned a non-JSON response (HTTP ${response.status})`,
      );
    }
  }

  if (!response.ok) {
    const detail =
      typeof parsed === "object" &&
      parsed !== null &&
      "message" in parsed &&
      typeof (parsed as { message?: unknown }).message === "string"
        ? (parsed as { message: string }).message
        : bodyText.slice(0, 300);

    throw new Error(
      `${providerLabel} lookup failed (HTTP ${response.status}): ${detail}`,
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${providerLabel} returned an unexpected response shape`);
  }

  return parsed as Record<string, unknown>;
}

function mapLineItems(items: unknown): PoLineItem[] | null {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  const mapped = items
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;

      return {
        description:
          toStringOrNull(record.description) ??
          toStringOrNull(record.PurchaseOrderItemText) ??
          "Line item",
        quantity: toNumber(record.quantity ?? record.order_qty),
        unitPrice: toNumber(record.unit_price ?? record.net_price),
        totalPrice: toNumber(record.total_price ?? record.line_total),
      };
    })
    .filter((item): item is PoLineItem => item !== null);

  return mapped.length > 0 ? mapped : null;
}

function buildResult(
  poNumber: string,
  rawData: Record<string, unknown>,
  fields: Omit<PoLookupResult, "poNumber" | "rawData">,
): PoLookupResult {
  return {
    poNumber,
    rawData,
    ...fields,
  };
}

/**
 * Coupa purchase order lookup.
 * Endpoint: GET {baseUrl}/api/purchase_orders?number={poNumber}
 * Auth: api_key via X-COUPA-API-KEY header.
 * Response: purchase_orders[0] with number, supplier.name, total, etc.
 */
async function lookupCoupaPoNumber(
  poNumber: string,
  config: PoIntegrationConfig,
): Promise<PoLookupResult> {
  const baseUrl = requireBaseUrl(config);
  const credentials = requireEncryptedCredentials(config);
  const apiKey = credentials.apiKey ?? credentials.api_key;

  if (!apiKey) {
    throw new Error("Coupa credentials must include apiKey");
  }

  const url = `${baseUrl}/api/purchase_orders?number=${encodeURIComponent(poNumber)}`;
  const rawData = await fetchJson(
    url,
    {
      method: "GET",
      headers: {
        "X-COUPA-API-KEY": apiKey,
      },
    },
    "Coupa",
  );

  const purchaseOrders = rawData.purchase_orders;
  const record =
    Array.isArray(purchaseOrders) && purchaseOrders[0] &&
    typeof purchaseOrders[0] === "object"
      ? (purchaseOrders[0] as Record<string, unknown>)
      : null;

  if (!record) {
    return buildResult(poNumber, rawData, {
      found: false,
      vendor: null,
      amount: null,
      currency: null,
      description: null,
      requestedBy: null,
      approvedBy: null,
      department: null,
      costCenter: null,
      lineItems: null,
    });
  }

  const supplier =
    record.supplier && typeof record.supplier === "object"
      ? (record.supplier as Record<string, unknown>)
      : null;
  const requestedBy =
    record.requested_by && typeof record.requested_by === "object"
      ? (record.requested_by as Record<string, unknown>)
      : null;

  return buildResult(poNumber, rawData, {
    found: true,
    vendor: toStringOrNull(supplier?.name),
    amount: toNumber(record.total),
    currency: toStringOrNull(record.currency_code),
    description: toStringOrNull(record.description),
    requestedBy: toStringOrNull(requestedBy?.name),
    approvedBy: toStringOrNull(record.approved_by),
    department: toStringOrNull(record.department),
    costCenter: toStringOrNull(record.cost_center),
    lineItems: mapLineItems(record.line_items),
  });
}

/**
 * SAP purchase order lookup.
 * Endpoint: GET {baseUrl}/sap/opu/odata/sap/MM_PUR_PO_MAINTAIN_APP_SRV/A_PurchaseOrder('{poNumber}')
 * Auth: basic_auth (username/password base64).
 * Response: d object with PurchaseOrder, Supplier, DocumentCurrency, etc.
 */
async function lookupSapPoNumber(
  poNumber: string,
  config: PoIntegrationConfig,
): Promise<PoLookupResult> {
  const baseUrl = requireBaseUrl(config);
  const credentials = requireEncryptedCredentials(config);
  const username = credentials.username;
  const password = credentials.password;

  if (!username || !password) {
    throw new Error("SAP credentials must include username and password");
  }

  const url = `${baseUrl}/sap/opu/odata/sap/MM_PUR_PO_MAINTAIN_APP_SRV/A_PurchaseOrder('${encodeURIComponent(poNumber)}')`;
  const auth = Buffer.from(`${username}:${password}`).toString("base64");
  const rawData = await fetchJson(
    url,
    {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
      },
    },
    "SAP",
  );

  const record =
    rawData.d && typeof rawData.d === "object"
      ? (rawData.d as Record<string, unknown>)
      : null;

  if (!record) {
    return buildResult(poNumber, rawData, {
      found: false,
      vendor: null,
      amount: null,
      currency: null,
      description: null,
      requestedBy: null,
      approvedBy: null,
      department: null,
      costCenter: null,
      lineItems: null,
    });
  }

  return buildResult(poNumber, rawData, {
    found: true,
    vendor: toStringOrNull(record.Supplier),
    amount: toNumber(record.TotalNetAmount ?? record.PurchaseOrderNetAmount),
    currency: toStringOrNull(record.DocumentCurrency),
    description: toStringOrNull(record.PurchaseOrderText),
    requestedBy: null,
    approvedBy: null,
    department: null,
    costCenter: null,
    lineItems: null,
  });
}

/**
 * Prendio purchase order lookup.
 * Endpoint: GET {baseUrl}/api/v1/pos/{poNumber}
 * Auth: Bearer token from api_key credential.
 * Response: data object with po_number, vendor_name, total_amount, etc.
 */
async function lookupPrendioPoNumber(
  poNumber: string,
  config: PoIntegrationConfig,
): Promise<PoLookupResult> {
  const baseUrl = requireBaseUrl(config);
  const credentials = requireEncryptedCredentials(config);
  const apiKey = credentials.apiKey ?? credentials.api_key;

  if (!apiKey) {
    throw new Error("Prendio credentials must include apiKey");
  }

  const url = `${baseUrl}/api/v1/pos/${encodeURIComponent(poNumber)}`;
  const rawData = await fetchJson(
    url,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
    "Prendio",
  );

  const record =
    rawData.data && typeof rawData.data === "object"
      ? (rawData.data as Record<string, unknown>)
      : rawData;

  const vendor = toStringOrNull(record.vendor_name);
  const amount = toNumber(record.total_amount);
  const description = toStringOrNull(record.notes);

  return buildResult(poNumber, rawData, {
    found: Boolean(vendor || amount !== null || description),
    vendor,
    amount,
    currency: toStringOrNull(record.currency),
    description,
    requestedBy: toStringOrNull(record.requester_email),
    approvedBy: null,
    department: toStringOrNull(record.department_name),
    costCenter: null,
    lineItems: mapLineItems(record.line_items),
  });
}

/**
 * NetSuite purchase order lookup.
 * Endpoint: GET {baseUrl}/services/rest/record/v1/purchaseorder/{poNumber}
 * Auth: oauth2 Bearer token.
 * Response: direct object with tranid, entity.refName, total, etc.
 */
async function lookupNetsuitePoNumber(
  poNumber: string,
  config: PoIntegrationConfig,
): Promise<PoLookupResult> {
  const baseUrl = requireBaseUrl(config);
  const credentials = requireEncryptedCredentials(config);
  const accessToken =
    credentials.accessToken ?? credentials.access_token ?? credentials.token;

  if (!accessToken) {
    throw new Error("NetSuite credentials must include accessToken");
  }

  const url = `${baseUrl}/services/rest/record/v1/purchaseorder/${encodeURIComponent(poNumber)}`;
  const rawData = await fetchJson(
    url,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    "NetSuite",
  );

  const entity =
    rawData.entity && typeof rawData.entity === "object"
      ? (rawData.entity as Record<string, unknown>)
      : null;
  const currency =
    rawData.currency && typeof rawData.currency === "object"
      ? (rawData.currency as Record<string, unknown>)
      : null;

  const itemContainer =
    rawData.item && typeof rawData.item === "object"
      ? (rawData.item as Record<string, unknown>)
      : null;

  return buildResult(poNumber, rawData, {
    found: true,
    vendor: toStringOrNull(entity?.refName),
    amount: toNumber(rawData.total),
    currency: toStringOrNull(currency?.refName),
    description: toStringOrNull(rawData.memo),
    requestedBy: null,
    approvedBy: null,
    department: null,
    costCenter: null,
    lineItems: mapLineItems(itemContainer?.items),
  });
}

/**
 * Oracle Fusion purchase order lookup.
 * Endpoint: GET {baseUrl}/fscmRestApi/resources/11.13.18.05/purchaseOrders?q=OrderNumber={poNumber}
 * Auth: basic_auth.
 * Response: items[0] with OrderNumber, Supplier, OrderAmount, etc.
 */
async function lookupOraclePoNumber(
  poNumber: string,
  config: PoIntegrationConfig,
): Promise<PoLookupResult> {
  const baseUrl = requireBaseUrl(config);
  const credentials = requireEncryptedCredentials(config);
  const username = credentials.username;
  const password = credentials.password;

  if (!username || !password) {
    throw new Error("Oracle credentials must include username and password");
  }

  const url = `${baseUrl}/fscmRestApi/resources/11.13.18.05/purchaseOrders?q=OrderNumber=${encodeURIComponent(poNumber)}`;
  const auth = Buffer.from(`${username}:${password}`).toString("base64");
  const rawData = await fetchJson(
    url,
    {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
      },
    },
    "Oracle",
  );

  const items = rawData.items;
  const record =
    Array.isArray(items) && items[0] && typeof items[0] === "object"
      ? (items[0] as Record<string, unknown>)
      : null;

  if (!record) {
    return buildResult(poNumber, rawData, {
      found: false,
      vendor: null,
      amount: null,
      currency: null,
      description: null,
      requestedBy: null,
      approvedBy: null,
      department: null,
      costCenter: null,
      lineItems: null,
    });
  }

  return buildResult(poNumber, rawData, {
    found: true,
    vendor: toStringOrNull(record.Supplier),
    amount: toNumber(record.OrderAmount),
    currency: toStringOrNull(record.CurrencyCode),
    description: toStringOrNull(record.Description),
    requestedBy: null,
    approvedBy: null,
    department: null,
    costCenter: null,
    lineItems: null,
  });
}

/**
 * Generic REST lookup for custom providers.
 * Endpoint: GET {baseUrl}/{poNumber}
 * Uses fieldMappings to map response fields into PoLookupResult.
 */
async function lookupGenericPoNumber(
  poNumber: string,
  config: PoIntegrationConfig,
): Promise<PoLookupResult> {
  const baseUrl = requireBaseUrl(config);
  const credentials = config.encryptedCredentials
    ? decryptCredentials(config.encryptedCredentials)
    : {};
  const url = `${baseUrl}/${encodeURIComponent(poNumber)}`;
  const headers: Record<string, string> = {};

  if (config.authType === "api_key") {
    const apiKey = credentials.apiKey ?? credentials.api_key;
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
      headers["X-API-KEY"] = apiKey;
    }
  } else if (config.authType === "oauth2") {
    const accessToken =
      credentials.accessToken ?? credentials.access_token ?? credentials.token;
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
  } else if (config.authType === "basic_auth") {
    const username = credentials.username;
    const password = credentials.password;
    if (username && password) {
      headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
    }
  }

  const rawData = await fetchJson(
    url,
    {
      method: "GET",
      headers,
    },
    config.displayName,
  );

  const mappings =
    config.fieldMappings &&
    typeof config.fieldMappings === "object" &&
    !Array.isArray(config.fieldMappings)
      ? (config.fieldMappings as FieldMappings)
      : {};

  const mapped = applyFieldMappings(
    buildResult(poNumber, rawData, {
      found: false,
      vendor: null,
      amount: null,
      currency: null,
      description: null,
      requestedBy: null,
      approvedBy: null,
      department: null,
      costCenter: null,
      lineItems: null,
    }),
    mappings,
  );

  return {
    ...mapped,
    found: mapped.found,
    poNumber: mapped.poNumber || poNumber,
  };
}

async function dispatchProviderLookup(
  poNumber: string,
  config: PoIntegrationConfig,
): Promise<PoLookupResult> {
  switch (config.provider) {
    case "coupa":
      return lookupCoupaPoNumber(poNumber, config);
    case "sap":
      return lookupSapPoNumber(poNumber, config);
    case "prendio":
      return lookupPrendioPoNumber(poNumber, config);
    case "netsuite":
      return lookupNetsuitePoNumber(poNumber, config);
    case "oracle":
      return lookupOraclePoNumber(poNumber, config);
    case "manual":
      return emptyPoLookupResult(poNumber);
    case "other":
      return lookupGenericPoNumber(poNumber, config);
    default:
      throw new Error(`Unsupported PO provider: ${config.provider}`);
  }
}

async function logPoLookup(input: {
  organizationId: string;
  contractId?: string;
  poNumber: string;
  provider: string;
  success: boolean;
  responseData?: Record<string, unknown>;
  errorMessage?: string;
  lookedUpByEmail: string;
}): Promise<void> {
  try {
    const prisma = getPrismaClient();
    await prisma.poLookupLog.create({
      data: {
        organizationId: input.organizationId,
        contractId: input.contractId,
        poNumber: input.poNumber,
        provider: input.provider,
        success: input.success,
        responseData: input.responseData
          ? (input.responseData as Prisma.InputJsonValue)
          : undefined,
        errorMessage: input.errorMessage,
        lookedUpByEmail: input.lookedUpByEmail,
      },
    });
  } catch (error) {
    reportError(error, {
      scope: "po-integration.logPoLookup",
      organizationId: input.organizationId,
      poNumber: input.poNumber,
    });
  }
}

export async function getPoConfig(
  organizationId: string,
): Promise<PoIntegrationConfig | null> {
  const prisma = getPrismaClient();
  const config = await prisma.poIntegrationConfig.findUnique({
    where: { organizationId },
  });

  if (!config || !config.isEnabled) {
    return null;
  }

  return config;
}

export type PublicPoIntegrationConfig = {
  configured: true;
  provider: PoIntegrationConfig["provider"];
  isEnabled: boolean;
  displayName: string;
  baseUrl: string | null;
  authType: PoIntegrationConfig["authType"];
  fieldMappings: PoIntegrationConfig["fieldMappings"];
  autoPopulateOnMatch: boolean;
  requirePoNumber: boolean;
  allowedContractTypes: PoIntegrationConfig["allowedContractTypes"];
  hasStoredCredentials: boolean;
};

export function toIntakePoConfig(
  config: PoIntegrationConfig,
): IntakePoConfig {
  const allowedContractTypes = Array.isArray(config.allowedContractTypes)
    ? (config.allowedContractTypes as string[])
    : config.allowedContractTypes === null
      ? null
      : undefined;

  return {
    configured: true,
    isEnabled: config.isEnabled,
    displayName: config.displayName,
    autoPopulateOnMatch: config.autoPopulateOnMatch,
    requirePoNumber: config.requirePoNumber,
    allowedContractTypes,
  };
}

export function toPublicPoConfig(
  config: PoIntegrationConfig,
): PublicPoIntegrationConfig {
  return {
    configured: true,
    provider: config.provider,
    isEnabled: config.isEnabled,
    displayName: config.displayName,
    baseUrl: config.baseUrl,
    authType: config.authType,
    fieldMappings: config.fieldMappings,
    autoPopulateOnMatch: config.autoPopulateOnMatch,
    requirePoNumber: config.requirePoNumber,
    allowedContractTypes: config.allowedContractTypes,
    hasStoredCredentials: Boolean(config.encryptedCredentials),
  };
}

export async function loadPoIntegrationConfig(
  organizationId: string,
): Promise<PoIntegrationConfig | null> {
  const prisma = getPrismaClient();
  return prisma.poIntegrationConfig.findUnique({
    where: { organizationId },
  });
}

export async function lookupPoNumber(
  poNumber: string,
  organizationId: string,
  lookedUpByEmail: string,
  contractId?: string,
): Promise<PoLookupResult> {
  const trimmedPoNumber = poNumber.trim();
  const config = await getPoConfig(organizationId);

  if (!config) {
    return emptyPoLookupResult(trimmedPoNumber);
  }

  try {
    const providerResult = await dispatchProviderLookup(trimmedPoNumber, config);
    const mappings =
      config.fieldMappings &&
      typeof config.fieldMappings === "object" &&
      !Array.isArray(config.fieldMappings)
        ? (config.fieldMappings as FieldMappings)
        : undefined;
    const normalized = applyFieldMappings(providerResult, mappings);

    await logPoLookup({
      organizationId,
      contractId,
      poNumber: trimmedPoNumber,
      provider: config.provider,
      success: normalized.found,
      responseData: normalized.rawData,
      lookedUpByEmail,
    });

    return normalized;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "PO lookup failed";

    reportError(error, {
      scope: "po-integration.lookupPoNumber",
      organizationId,
      poNumber: trimmedPoNumber,
      provider: config.provider,
      contractId,
    });

    await logPoLookup({
      organizationId,
      contractId,
      poNumber: trimmedPoNumber,
      provider: config.provider,
      success: false,
      errorMessage,
      lookedUpByEmail,
    });

    return emptyPoLookupResult(trimmedPoNumber);
  }
}

export interface PoTestConfigInput {
  provider: PoIntegrationConfig["provider"];
  displayName: string;
  baseUrl: string | null;
  authType: PoIntegrationConfig["authType"];
  credentials?: Record<string, string>;
  fieldMappings?: PoIntegrationConfig["fieldMappings"];
  useStoredCredentials?: boolean;
}

async function runPoLookupWithConfig(
  poNumber: string,
  config: PoIntegrationConfig,
  organizationId: string,
  lookedUpByEmail: string,
  contractId?: string,
): Promise<PoLookupResult> {
  const trimmedPoNumber = poNumber.trim();

  try {
    const providerResult = await dispatchProviderLookup(trimmedPoNumber, config);
    const mappings =
      config.fieldMappings &&
      typeof config.fieldMappings === "object" &&
      !Array.isArray(config.fieldMappings)
        ? (config.fieldMappings as FieldMappings)
        : undefined;
    const normalized = applyFieldMappings(providerResult, mappings);

    await logPoLookup({
      organizationId,
      contractId,
      poNumber: trimmedPoNumber,
      provider: config.provider,
      success: normalized.found,
      responseData: normalized.rawData,
      lookedUpByEmail,
    });

    return normalized;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "PO lookup failed";

    reportError(error, {
      scope: "po-integration.testPoLookup",
      organizationId,
      poNumber: trimmedPoNumber,
      provider: config.provider,
      contractId,
    });

    await logPoLookup({
      organizationId,
      contractId,
      poNumber: trimmedPoNumber,
      provider: config.provider,
      success: false,
      errorMessage,
      lookedUpByEmail,
    });

    throw error;
  }
}

export async function testPoLookup(
  poNumber: string,
  organizationId: string,
  lookedUpByEmail: string,
  draft?: PoTestConfigInput,
): Promise<PoLookupResult> {
  const trimmedPoNumber = poNumber.trim();
  const existing = await loadPoIntegrationConfig(organizationId);

  if (!draft && !existing) {
    throw new Error("PO integration is not configured.");
  }

  let config: PoIntegrationConfig;

  if (draft) {
    let encryptedCredentials = existing?.encryptedCredentials ?? null;

    if (draft.credentials && Object.keys(draft.credentials).length > 0) {
      encryptedCredentials = encryptCredentials(draft.credentials);
    } else if (!draft.useStoredCredentials) {
      encryptedCredentials = null;
    }

    config = {
      id: existing?.id ?? "draft",
      organizationId,
      provider: draft.provider,
      isEnabled: true,
      displayName: draft.displayName,
      baseUrl: draft.baseUrl,
      authType: draft.authType,
      encryptedCredentials,
      fieldMappings: draft.fieldMappings ?? existing?.fieldMappings ?? null,
      autoPopulateOnMatch: existing?.autoPopulateOnMatch ?? true,
      requirePoNumber: existing?.requirePoNumber ?? false,
      allowedContractTypes: existing?.allowedContractTypes ?? null,
      createdAt: existing?.createdAt ?? new Date(),
      updatedAt: new Date(),
    };
  } else {
    config = existing!;
  }

  return runPoLookupWithConfig(
    trimmedPoNumber,
    config,
    organizationId,
    lookedUpByEmail,
  );
}
