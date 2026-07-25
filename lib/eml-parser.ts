export interface ParsedEmlMessage {
  subject: string;
  from: string;
  to: string;
  cc: string;
  sentAt: string;
  body: string;
}

function decodeHeaderValue(value: string): string {
  return value
    .replace(/^=\?utf-8\?b\?/i, "")
    .replace(/\?=.*$/i, "")
    .trim();
}

function getHeader(headers: string, name: string): string {
  const pattern = new RegExp(`^${name}:\\s*(.+)$`, "im");
  const match = headers.match(pattern);

  return match?.[1] ? decodeHeaderValue(match[1].trim()) : "";
}

function normalizeSentAt(value: string): string {
  if (!value) {
    return new Date().toISOString();
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
}

function extractBody(content: string): string {
  const parts = content.split(/\r?\n\r?\n/);

  if (parts.length < 2) {
    return "";
  }

  const body = parts.slice(1).join("\n\n").trim();

  if (body.toLowerCase().includes("content-type: multipart")) {
    const textPart = body.match(
      /Content-Type:\s*text\/plain[\s\S]*?\r?\n\r?\n([\s\S]*?)(?:\r?\n--|$)/i,
    );

    if (textPart?.[1]) {
      return textPart[1].trim();
    }
  }

  return body.slice(0, 4000);
}

export function parseEmlContent(content: string): ParsedEmlMessage {
  const headerSection = content.split(/\r?\n\r?\n/)[0] ?? content;

  return {
    subject: getHeader(headerSection, "Subject") || "Untitled email",
    from: getHeader(headerSection, "From"),
    to: getHeader(headerSection, "To"),
    cc: getHeader(headerSection, "Cc"),
    sentAt: normalizeSentAt(getHeader(headerSection, "Date")),
    body: extractBody(content),
  };
}
