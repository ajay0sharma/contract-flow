import OpenAI from "openai";
import { getCompanyConfig } from "@/lib/company-config";
import { decodeAttachmentTextFromStorage } from "@/lib/contract-attachment-storage";
import {
  OBLIGATION_TYPES,
  type ObligationScanResult,
  type ScannedObligationItem,
} from "@/types/obligations";
import type { ContractAttachment, ContractRecord } from "@/types/contract";

const VALID_TYPES = new Set<string>(OBLIGATION_TYPES);

function normalizeObligationType(value: string): string {
  const trimmed = value.trim();

  if (VALID_TYPES.has(trimmed)) {
    return trimmed;
  }

  const match = OBLIGATION_TYPES.find(
    (type) => type.toLowerCase() === trimmed.toLowerCase(),
  );

  return match ?? "other";
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

function normalizeScanResult(raw: unknown): ObligationScanResult {
  if (!raw || typeof raw !== "object") {
    throw new Error("AI scan returned an invalid response.");
  }

  const payload = raw as {
    summary?: unknown;
    obligations?: unknown;
  };

  const summary =
    typeof payload.summary === "string" ? payload.summary.trim() : "";

  if (!summary) {
    throw new Error("AI scan did not return an obligation summary.");
  }

  if (!Array.isArray(payload.obligations)) {
    throw new Error("AI scan did not return obligation items.");
  }

  const obligations = payload.obligations
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const description =
        typeof record.description === "string"
          ? record.description.trim()
          : "";

      if (!description) {
        return null;
      }

      return {
        description,
        obligationType: normalizeObligationType(
          typeof record.obligationType === "string"
            ? record.obligationType
            : "other",
        ),
        dueDate: parseDueDate(record.dueDate),
        isRecurring: Boolean(record.isRecurring),
        frequency:
          typeof record.frequency === "string" && record.frequency.trim()
            ? record.frequency.trim()
            : null,
      };
    })
    .filter((item): item is ScannedObligationItem => item !== null);

  if (obligations.length === 0) {
    throw new Error("AI scan did not identify any company obligations.");
  }

  return { summary, obligations };
}

function buildMockScanResult(
  contract: ContractRecord,
  attachment: ContractAttachment,
): ObligationScanResult {
  const company = getCompanyConfig(contract.companyProfileId);
  const obligations: ScannedObligationItem[] = [
    {
      description: `Provide payment to ${contract.companyName} according to the payment schedule in the fully executed ${contract.contractType}.`,
      obligationType: "Payment",
      dueDate: contract.contractEndDate
        ? new Date(contract.contractEndDate).toISOString()
        : null,
      isRecurring: false,
      frequency: null,
    },
    {
      description: `Maintain confidentiality of ${contract.companyName}'s non-public information received under the agreement.`,
      obligationType: "Confidentiality",
      dueDate: null,
      isRecurring: true,
      frequency: "Annually",
    },
    {
      description: `Deliver contracted services or deliverables described in ${attachment.fileName} on the timeline defined in the agreement.`,
      obligationType: "Delivery",
      dueDate: contract.contractStartDate
        ? new Date(contract.contractStartDate).toISOString()
        : null,
      isRecurring: false,
      frequency: null,
    },
    {
      description: `Provide written notice to ${contract.companyName} before making material changes that affect performance under the agreement.`,
      obligationType: "Notice",
      dueDate: null,
      isRecurring: false,
      frequency: null,
    },
  ];

  if (contract.contractType.toLowerCase().includes("data processing")) {
    obligations.push({
      description:
        "Maintain compliance with applicable data protection requirements and cooperate on data subject requests.",
      obligationType: "Compliance",
      dueDate: null,
      isRecurring: true,
      frequency: "Quarterly",
    });
  } else {
    obligations.push({
      description:
        "Submit status or performance reports required under the agreement to the counterparty contact.",
      obligationType: "Reporting",
      dueDate: null,
      isRecurring: true,
      frequency: "Quarterly",
    });
  }

  return {
    summary: `${company.name} has ${obligations.length} company-side obligations identified from ${attachment.fileName} for the ${contract.contractType} with ${contract.companyName}.`,
    obligations,
  };
}

async function buildPrompt(
  contract: ContractRecord,
  attachment: ContractAttachment,
): Promise<string> {
  const company = getCompanyConfig(contract.companyProfileId);
  const attachmentText = await decodeAttachmentTextFromStorage(attachment);

  return [
    "You are a legal contract analyst.",
    `Identify obligations owed by our company (${company.name}) under the fully executed agreement.`,
    "Do not include obligations owed by the counterparty/vendor.",
    `Counterparty: ${contract.companyName}`,
    `Contract title: ${contract.title}`,
    `Contract type: ${contract.contractType}`,
    `Contract description: ${contract.description}`,
    `Contract amount: ${contract.amount || "Not specified"}`,
    `Contract term: ${contract.contractStartDate} to ${contract.contractEndDate}`,
    `Executed agreement file: ${attachment.fileName} (${attachment.mimeType})`,
    attachmentText
      ? `Agreement text excerpt:\n${attachmentText.slice(0, 12000)}`
      : "Agreement text could not be extracted locally. Infer likely company obligations from the contract metadata and document type.",
    `Return strict JSON with shape {"summary": string, "obligations": [{"description": string, "obligationType": "Payment|Reporting|Delivery|Compliance|Notice|Confidentiality|Other", "dueDate": "YYYY-MM-DD|null", "isRecurring": boolean, "frequency": "Monthly|Quarterly|Annually|null"}]}.`,
    "Include only concrete company obligations.",
  ].join("\n\n");
}

async function scanWithOpenAI(
  contract: ContractRecord,
  attachment: ContractAttachment,
): Promise<ObligationScanResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return buildMockScanResult(contract, attachment);
  }

  const client = new OpenAI({ apiKey });
  const prompt = await buildPrompt(contract, attachment);

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_OBLIGATION_MODEL ?? "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Extract company obligations from contracts. Respond with valid JSON only.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const message = response.choices[0]?.message?.content;

  if (!message) {
    throw new Error("AI scan returned an empty response.");
  }

  return normalizeScanResult(JSON.parse(message));
}

export async function scanCompanyObligations(
  contract: ContractRecord,
  attachment: ContractAttachment,
): Promise<ObligationScanResult> {
  try {
    return await scanWithOpenAI(contract, attachment);
  } catch (error) {
    if (process.env.OPENAI_API_KEY) {
      throw error instanceof Error
        ? error
        : new Error("AI obligation scan failed.");
    }

    return buildMockScanResult(contract, attachment);
  }
}
