import Anthropic from "@anthropic-ai/sdk";
import { getCompanyConfig } from "@/lib/company-config";
import { OBLIGATION_TYPE_VALUES } from "@/lib/obligation-types";
import type { ObligationType } from "@/lib/generated/prisma/enums";

const VALID_TYPES = new Set<string>(OBLIGATION_TYPE_VALUES);
const VALID_FREQUENCIES = new Set([
  "Daily",
  "Weekly",
  "Monthly",
  "Quarterly",
  "Annually",
  "Per milestone",
]);
const VALID_RESPONSIBLE_PARTIES = new Set([
  "Finance",
  "Legal",
  "Operations",
  "IT",
  "HR",
  "Executive",
  "All departments",
  "Unknown",
]);
const VALID_CONFIDENCE = new Set(["high", "medium", "low"]);

const SYSTEM_PROMPT = `You are a senior commercial lawyer specialising in contract obligation analysis. Your task is to read a fully executed contract and identify ALL obligations that OUR COMPANY (not the counterparty) must fulfill.

OUR COMPANY is identified as the client, licensee, customer, buyer, or service recipient in this agreement. The counterparty is the vendor, licensor, supplier, or service provider.

For every obligation you find that OUR COMPANY must perform, return a JSON object. Be thorough — a single contract may have 10 to 30 obligations.

For each obligation return:
{
  description: string — a clear, plain English statement of what the company must do. Start with an action verb. Be specific and include amounts, dates, and thresholds mentioned.
    Example: 'Pay monthly license fee of $4,000 by the 1st of each month'
  
  obligationType: one of these exact values only:
    payment | reporting | delivery | compliance | notice | confidentiality | ip_ownership | indemnification | insurance | non_compete | data_protection | audit_right | renewal_notice | termination_notice | milestone | other
  
  dueDate: ISO 8601 date string if a specific date is mentioned, otherwise null
  
  isRecurring: true if this obligation repeats on a schedule
  
  frequency: if isRecurring is true, one of: Daily, Weekly, Monthly, Quarterly, Annually, Per milestone
    Otherwise null
  
  noticePeriodDays: if this obligation requires advance notice (e.g. 'provide 30 days written notice'), the number of days. Otherwise null
  
  sourceClause: the section number or clause reference where this obligation appears, e.g. 'Section 4.2' or 'Clause 8(b)'. If not identifiable, null.
  
  responsibleParty: the team or department most likely responsible for fulfilling this obligation, inferred from context.
    One of: Finance, Legal, Operations, IT, HR, Executive, All departments, Unknown
  
  confidenceScore: your confidence that this is a genuine obligation of our company (not the counterparty). One of: high, medium, low
}

Return ONLY a valid JSON array of obligation objects. No preamble, no explanation, no markdown code blocks, no trailing commas. Start your response with [ and end with ].`;

export interface ScannedObligationInput {
  description: string;
  obligationType: ObligationType;
  dueDate: string | null;
  isRecurring: boolean;
  frequency: string | null;
  noticePeriodDays: number | null;
  sourceClause: string | null;
  responsibleParty: string | null;
  confidenceScore: string;
}

function normalizeObligationType(value: unknown): ObligationType {
  if (typeof value !== "string") {
    return "other";
  }

  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");

  if (VALID_TYPES.has(normalized)) {
    return normalized as ObligationType;
  }

  return "other";
}

function parseDueDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return new Date(timestamp).toISOString();
}

function parseNoticePeriodDays(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeFrequency(value: unknown, isRecurring: boolean): string | null {
  if (!isRecurring) {
    return null;
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const match = Array.from(VALID_FREQUENCIES).find(
    (frequency) => frequency.toLowerCase() === value.trim().toLowerCase(),
  );

  return match ?? null;
}

function normalizeResponsibleParty(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return "Unknown";
  }

  const match = Array.from(VALID_RESPONSIBLE_PARTIES).find(
    (party) => party.toLowerCase() === value.trim().toLowerCase(),
  );

  return match ?? "Unknown";
}

function normalizeConfidence(value: unknown): string {
  if (typeof value !== "string") {
    return "medium";
  }

  const normalized = value.trim().toLowerCase();
  return VALID_CONFIDENCE.has(normalized) ? normalized : "medium";
}

function extractJsonArray(raw: string): unknown {
  const trimmed = raw.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const start = withoutFence.indexOf("[");
  const end = withoutFence.lastIndexOf("]");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI response did not contain a JSON array.");
  }

  return JSON.parse(withoutFence.slice(start, end + 1));
}

function normalizeObligation(item: unknown): ScannedObligationInput | null {
  if (!item || typeof item !== "object") {
    return null;
  }

  const record = item as Record<string, unknown>;
  const description =
    typeof record.description === "string" ? record.description.trim() : "";

  if (!description) {
    return null;
  }

  const isRecurring = Boolean(record.isRecurring);

  return {
    description,
    obligationType: normalizeObligationType(record.obligationType),
    dueDate: parseDueDate(record.dueDate),
    isRecurring,
    frequency: normalizeFrequency(record.frequency, isRecurring),
    noticePeriodDays: parseNoticePeriodDays(record.noticePeriodDays),
    sourceClause:
      typeof record.sourceClause === "string" && record.sourceClause.trim()
        ? record.sourceClause.trim()
        : null,
    responsibleParty: normalizeResponsibleParty(record.responsibleParty),
    confidenceScore: normalizeConfidence(record.confidenceScore),
  };
}

export async function scanContractObligationsWithAi(input: {
  contractText: string;
  ourCompanyName: string;
  counterpartyName: string;
  contractTitle: string;
  contractType: string;
}): Promise<ScannedObligationInput[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  const client = new Anthropic({ apiKey });
  const userMessage = `Contract parties:
Our company: ${input.ourCompanyName}
Counterparty: ${input.counterpartyName}

Contract title: ${input.contractTitle}
Contract type: ${input.contractType}

Full contract text:
${input.contractText}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find((block) => block.type === "text");

  if (!textBlock || textBlock.type !== "text") {
    throw new Error("AI scan returned an empty response.");
  }

  const parsed = extractJsonArray(textBlock.text);

  if (!Array.isArray(parsed)) {
    throw new Error("AI scan did not return a JSON array.");
  }

  return parsed
    .map((item) => normalizeObligation(item))
    .filter((item): item is ScannedObligationInput => item !== null);
}

export function resolveOurCompanyName(companyProfileId?: string | null): string {
  return getCompanyConfig(companyProfileId ?? "default").name;
}
