export function formatContractDate(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10);
}

export function formatContractDateTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);

  if (Number.isNaN(date.getTime())) {
    return isoTimestamp.slice(0, 10);
  }

  return date.toISOString().replace("T", " ").slice(0, 16);
}

export function formatAuditTimestamp(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);

  if (Number.isNaN(date.getTime())) {
    return isoTimestamp.slice(0, 10);
  }

  const day = date.getDate();
  const month = date.toLocaleString("en-GB", { month: "short" });
  const year = date.getFullYear();
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const hour12 = hours % 12 || 12;
  const meridiem = hours < 12 ? "am" : "pm";

  return `${day} ${month} ${year} at ${hour12}:${minutes}${meridiem}`;
}

export function formatSubmittedTimestamp(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);

  if (Number.isNaN(date.getTime())) {
    return isoTimestamp.slice(0, 10);
  }

  const day = date.getDate();
  const month = date.toLocaleString("en-GB", { month: "long" });
  const year = date.getFullYear();
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const hour12 = hours % 12 || 12;
  const meridiem = hours < 12 ? "am" : "pm";

  return `${day} ${month} ${year} at ${hour12}:${minutes}${meridiem}`;
}
