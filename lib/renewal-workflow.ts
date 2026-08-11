import {
  getTodayDateKey,
  normalizeDateKey,
  resolveContractExpirationDate,
} from "@/lib/contract-expiration";
import type {
  ContractIntakeInput,
  ContractRecord,
  RenewalReminderType,
  RenewalStatus,
} from "@/types/contract";

export const RENEWAL_REMINDER_THRESHOLDS = [90, 60, 30, 14, 7, 0] as const;

export interface RenewalSettings {
  autoRenewal: boolean;
  renewalNoticeDays: number;
}

export interface RenewalQueueEntry {
  id: string;
  recordNumber: string;
  title: string;
  companyName: string;
  requesterName: string;
  requesterEmail: string;
  expirationDate: string;
  actionDeadline: string | null;
  daysUntilExpiration: number;
  autoRenewal: boolean;
  renewalNoticeDays: number;
  renewalStatus: RenewalStatus;
  displayStatus: RenewalStatus;
  stage: ContractRecord["stage"];
}

export interface RenewalQueueFilters {
  windowDays?: number;
  status?: RenewalStatus | "all";
  autoRenewal?: "all" | "yes" | "no";
}

export interface RenewalReminderCandidate {
  contract: ContractRecord;
  reminderType: RenewalReminderType;
  daysUntilExpiration: number;
  actionDeadline: string | null;
}

function readContractVariable(
  contract: ContractRecord,
  keys: string[],
): string | null {
  const variables = contract.contractVariables;

  if (!variables) {
    return null;
  }

  for (const key of keys) {
    const direct = variables[key]?.trim();

    if (direct) {
      return direct;
    }

    const normalizedKey = key.toLowerCase();
    const match = Object.entries(variables).find(
      ([variableKey]) => variableKey.toLowerCase() === normalizedKey,
    );

    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }

  return null;
}

function parseBoolean(value: string | null | undefined): boolean | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (["yes", "true", "1", "y"].includes(normalized)) {
    return true;
  }

  if (["no", "false", "0", "n"].includes(normalized)) {
    return false;
  }

  return null;
}

function parsePositiveInteger(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value.trim(), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function resolveRenewalSettings(
  contract: ContractRecord,
): RenewalSettings {
  if (typeof contract.autoRenewal === "boolean") {
    return {
      autoRenewal: contract.autoRenewal,
      renewalNoticeDays: contract.renewalNoticeDays ?? 30,
    };
  }

  const variableAutoRenewal = parseBoolean(
    readContractVariable(contract, ["auto_renewal", "autoRenewal"]),
  );
  const variableNoticeDays = parsePositiveInteger(
    readContractVariable(contract, [
      "renewal_notice_days",
      "renewalNoticeDays",
      "notice_period_days",
    ]),
  );

  if (variableAutoRenewal !== null || variableNoticeDays !== null) {
    return {
      autoRenewal: variableAutoRenewal ?? false,
      renewalNoticeDays: variableNoticeDays ?? 30,
    };
  }

  if (contract.otherNotes?.toLowerCase().includes("auto renewal")) {
    const noticeMatch = contract.otherNotes.match(/(\d+)-day notice/i);
    return {
      autoRenewal: true,
      renewalNoticeDays: noticeMatch
        ? Number.parseInt(noticeMatch[1], 10)
        : 30,
    };
  }

  return {
    autoRenewal: false,
    renewalNoticeDays: 30,
  };
}

export function syncContractExpiryDate(
  contract: ContractRecord,
): ContractRecord {
  if (contract.expiryDate?.trim()) {
    return contract;
  }

  const endDate = normalizeDateKey(contract.contractEndDate);

  if (!endDate) {
    return contract;
  }

  return {
    ...contract,
    expiryDate: `${endDate}T12:00:00.000Z`,
  };
}

export function computeRenewalActionDeadline(
  expirationDate: string,
  noticeDays: number,
): string | null {
  const normalizedExpiration = normalizeDateKey(expirationDate);

  if (!normalizedExpiration) {
    return null;
  }

  const deadline = new Date(`${normalizedExpiration}T12:00:00`);
  deadline.setDate(deadline.getDate() - noticeDays);

  const year = deadline.getFullYear();
  const month = String(deadline.getMonth() + 1).padStart(2, "0");
  const day = String(deadline.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function computeDaysUntilDate(
  targetDateKey: string,
  todayKey = getTodayDateKey(),
): number {
  const start = new Date(`${todayKey}T12:00:00`);
  const end = new Date(`${targetDateKey}T12:00:00`);
  const diffMs = end.getTime() - start.getTime();

  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

export function deriveComputedRenewalStatus(
  contract: ContractRecord,
  todayKey = getTodayDateKey(),
): RenewalStatus {
  const storedStatus = contract.renewalStatus ?? "not_due";

  if (
    storedStatus === "renewal_in_progress" ||
    storedStatus === "non_renewing" ||
    storedStatus === "renewed"
  ) {
    return storedStatus;
  }

  const expirationDate = resolveContractExpirationDate(contract);

  if (!expirationDate || contract.stage !== "active") {
    return "not_due";
  }

  const settings = resolveRenewalSettings(contract);
  const daysUntilExpiration = computeDaysUntilDate(expirationDate, todayKey);

  if (daysUntilExpiration < 0) {
    return settings.autoRenewal ? "notice_window" : "not_due";
  }

  if (daysUntilExpiration <= settings.renewalNoticeDays) {
    return "notice_window";
  }

  return "not_due";
}

export function resolveDisplayRenewalStatus(
  contract: ContractRecord,
  todayKey = getTodayDateKey(),
): RenewalStatus {
  return contract.renewalStatus &&
    ["renewal_in_progress", "non_renewing", "renewed"].includes(
      contract.renewalStatus,
    )
    ? contract.renewalStatus
    : deriveComputedRenewalStatus(contract, todayKey);
}

export function buildRenewalQueueEntry(
  contract: ContractRecord,
  todayKey = getTodayDateKey(),
): RenewalQueueEntry | null {
  const expirationDate = resolveContractExpirationDate(contract);

  if (!expirationDate || !["active", "awaiting_signature"].includes(contract.stage)) {
    return null;
  }

  const settings = resolveRenewalSettings(contract);
  const daysUntilExpiration = computeDaysUntilDate(expirationDate, todayKey);
  const displayStatus = resolveDisplayRenewalStatus(contract, todayKey);

  if (
    displayStatus === "not_due" &&
    daysUntilExpiration > settings.renewalNoticeDays
  ) {
    return null;
  }

  return {
    id: contract.id,
    recordNumber: contract.recordNumber,
    title: contract.title,
    companyName: contract.companyName,
    requesterName: contract.requesterName,
    requesterEmail: contract.requesterEmail,
    expirationDate,
    actionDeadline: computeRenewalActionDeadline(
      expirationDate,
      settings.renewalNoticeDays,
    ),
    daysUntilExpiration,
    autoRenewal: settings.autoRenewal,
    renewalNoticeDays: settings.renewalNoticeDays,
    renewalStatus: contract.renewalStatus ?? "not_due",
    displayStatus,
    stage: contract.stage,
  };
}

export function listRenewalQueue(
  contracts: ContractRecord[],
  filters: RenewalQueueFilters = {},
  todayKey = getTodayDateKey(),
): RenewalQueueEntry[] {
  const windowDays = filters.windowDays ?? 90;

  return contracts
    .map((contract) => buildRenewalQueueEntry(contract, todayKey))
    .filter((entry): entry is RenewalQueueEntry => entry !== null)
    .filter((entry) => entry.daysUntilExpiration <= windowDays)
    .filter((entry) => {
      if (!filters.status || filters.status === "all") {
        return true;
      }

      return entry.displayStatus === filters.status;
    })
    .filter((entry) => {
      if (!filters.autoRenewal || filters.autoRenewal === "all") {
        return true;
      }

      return filters.autoRenewal === "yes"
        ? entry.autoRenewal
        : !entry.autoRenewal;
    })
    .sort((left, right) => {
      if (left.daysUntilExpiration !== right.daysUntilExpiration) {
        return left.daysUntilExpiration - right.daysUntilExpiration;
      }

      return left.recordNumber.localeCompare(right.recordNumber);
    });
}

export function reminderTypeForDays(
  daysUntilExpiration: number,
): RenewalReminderType | null {
  switch (daysUntilExpiration) {
    case 90:
      return "notice_90";
    case 60:
      return "notice_60";
    case 30:
      return "notice_30";
    case 14:
      return "notice_14";
    case 7:
      return "notice_7";
    case 0:
      return "expiration_day";
    default:
      return null;
  }
}

export function listRenewalReminderCandidates(
  contracts: ContractRecord[],
  todayKey = getTodayDateKey(),
): RenewalReminderCandidate[] {
  const candidates: RenewalReminderCandidate[] = [];

  for (const contract of contracts) {
    if (contract.stage !== "active") {
      continue;
    }

    if (contract.renewalStatus === "non_renewing" || contract.renewalStatus === "renewed") {
      continue;
    }

    const expirationDate = resolveContractExpirationDate(contract);

    if (!expirationDate) {
      continue;
    }

    const settings = resolveRenewalSettings(contract);
    const daysUntilExpiration = computeDaysUntilDate(expirationDate, todayKey);
    const reminderType = reminderTypeForDays(daysUntilExpiration);

    if (
      reminderType &&
      daysUntilExpiration <= settings.renewalNoticeDays + 60
    ) {
      candidates.push({
        contract,
        reminderType,
        daysUntilExpiration,
        actionDeadline: computeRenewalActionDeadline(
          expirationDate,
          settings.renewalNoticeDays,
        ),
      });
    }

    const actionDeadline = computeRenewalActionDeadline(
      expirationDate,
      settings.renewalNoticeDays,
    );

    if (
      actionDeadline &&
      actionDeadline === todayKey &&
      daysUntilExpiration > 0
    ) {
      candidates.push({
        contract,
        reminderType: "action_deadline",
        daysUntilExpiration,
        actionDeadline,
      });
    }
  }

  return candidates;
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function buildRenewalIntakeInput(
  source: ContractRecord,
  actor: { email: string; name: string },
): ContractIntakeInput {
  const expirationDate =
    resolveContractExpirationDate(source) ?? getTodayDateKey();
  const renewalStartDate = addDaysToDateKey(expirationDate, 1);
  const renewalEndDate = addDaysToDateKey(renewalStartDate, 365);
  const settings = resolveRenewalSettings(source);

  return {
    requesterName: actor.name,
    requesterEmail: actor.email,
    department: source.department,
    contractType: source.contractType,
    contractStartDate: renewalStartDate,
    contractEndDate: renewalEndDate,
    contractTitle: `Renewal: ${source.title}`,
    contractDescription: `Renewal of ${source.recordNumber} (${source.title}).`,
    contractAmount: source.amount,
    budgeted: source.budgeted ?? undefined,
    poNumber: source.poNumber || undefined,
    parentAgreementId: source.id,
    otherNotes: [
      `Renewal initiated from ${source.recordNumber}.`,
      settings.autoRenewal
        ? `Prior agreement auto-renewed with ${settings.renewalNoticeDays}-day notice.`
        : "Prior agreement requires explicit renewal.",
    ].join(" "),
    companyName: source.companyName,
    address: source.address,
    mainContactName: source.mainContactName,
    mainContactTitle: source.mainContactTitle || undefined,
    mainContactEmail: source.mainContactEmail,
    mainContactPhone: source.mainContactPhone || undefined,
    counterpartyId: source.counterpartyId ?? undefined,
    companyProfileId: source.companyProfileId,
    templateId: source.templateId ?? undefined,
    templateVersion: source.templateVersion ?? undefined,
    intakeFormId: source.intakeFormId ?? undefined,
    templateVariables: source.contractVariables ?? undefined,
  };
}

export function applyRenewalSettingsToRecord(
  contract: ContractRecord,
): ContractRecord {
  const settings = resolveRenewalSettings(contract);

  return syncContractExpiryDate({
    ...contract,
    autoRenewal: settings.autoRenewal,
    renewalNoticeDays: settings.renewalNoticeDays,
  });
}

export function shouldAutoExpireContract(
  contract: ContractRecord,
  todayKey = getTodayDateKey(),
): boolean {
  if (contract.stage !== "active") {
    return false;
  }

  if (contract.renewalStatus === "renewal_in_progress") {
    return false;
  }

  const settings = resolveRenewalSettings(contract);

  if (settings.autoRenewal) {
    return false;
  }

  const expirationDate = resolveContractExpirationDate(contract);

  if (!expirationDate) {
    return false;
  }

  return computeDaysUntilDate(expirationDate, todayKey) < 0;
}
