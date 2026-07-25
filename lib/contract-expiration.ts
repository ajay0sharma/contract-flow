import type { ContractRecord } from "@/types/contract";

export interface ContractExpirationEntry {
  id: string;
  recordNumber: string;
  title: string;
  expirationDate: string;
  stage: ContractRecord["stage"];
  contractStatus?: ContractRecord["contractStatus"];
  isUpcoming: boolean;
}

export function normalizeDateKey(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const dateOnly = trimmed.slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    return null;
  }

  const parsed = new Date(`${dateOnly}T12:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return dateOnly;
}

export function getTodayDateKey(reference = new Date()): string {
  const year = reference.getFullYear();
  const month = String(reference.getMonth() + 1).padStart(2, "0");
  const day = String(reference.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function resolveContractExpirationDate(
  contract: ContractRecord,
): string | null {
  const candidate =
    contract.expiryDate?.trim() || contract.contractEndDate?.trim();

  if (!candidate) {
    return null;
  }

  return normalizeDateKey(candidate);
}

export function isUpcomingExpiration(
  expirationDate: string,
  todayKey = getTodayDateKey(),
): boolean {
  return expirationDate >= todayKey;
}

export function toContractExpirationEntry(
  contract: ContractRecord,
  todayKey = getTodayDateKey(),
): ContractExpirationEntry | null {
  const expirationDate = resolveContractExpirationDate(contract);

  if (!expirationDate) {
    return null;
  }

  return {
    id: contract.id,
    recordNumber: contract.recordNumber,
    title: contract.title,
    expirationDate,
    stage: contract.stage,
    contractStatus: contract.contractStatus,
    isUpcoming: isUpcomingExpiration(expirationDate, todayKey),
  };
}

export interface CalendarCell {
  dateKey: string;
  day: number;
  inCurrentMonth: boolean;
}

export function buildMonthGrid(
  year: number,
  monthIndex: number,
): CalendarCell[] {
  const firstOfMonth = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const mondayBasedOffset = (firstOfMonth.getDay() + 6) % 7;
  const cells: CalendarCell[] = [];

  for (let index = 0; index < mondayBasedOffset; index += 1) {
    const date = new Date(year, monthIndex, index - mondayBasedOffset + 1);
    cells.push({
      dateKey: formatDateParts(date),
      day: date.getDate(),
      inCurrentMonth: false,
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, monthIndex, day);
    cells.push({
      dateKey: formatDateParts(date),
      day,
      inCurrentMonth: true,
    });
  }

  while (cells.length % 7 !== 0) {
    const lastCell = cells[cells.length - 1];
    const lastDate = parseDateKey(lastCell.dateKey);
    const nextDate = new Date(
      lastDate.getFullYear(),
      lastDate.getMonth(),
      lastDate.getDate() + 1,
    );

    cells.push({
      dateKey: formatDateParts(nextDate),
      day: nextDate.getDate(),
      inCurrentMonth: false,
    });
  }

  return cells;
}

export function formatMonthLabel(year: number, monthIndex: number): string {
  return new Date(year, monthIndex, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function formatDisplayDate(dateKey: string): string {
  const date = parseDateKey(dateKey);

  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateParts(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00`);
}

export function groupExpirationsByDate(
  entries: ContractExpirationEntry[],
): Map<string, ContractExpirationEntry[]> {
  const grouped = new Map<string, ContractExpirationEntry[]>();

  for (const entry of entries) {
    const existing = grouped.get(entry.expirationDate) ?? [];
    existing.push(entry);
    grouped.set(entry.expirationDate, existing);
  }

  for (const [dateKey, list] of grouped.entries()) {
    grouped.set(
      dateKey,
      [...list].sort((left, right) =>
        left.recordNumber.localeCompare(right.recordNumber),
      ),
    );
  }

  return grouped;
}
