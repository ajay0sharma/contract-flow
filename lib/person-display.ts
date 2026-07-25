export function getPersonInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "?";
  }

  if (words.length === 1) {
    return words[0].charAt(0).toUpperCase();
  }

  const firstInitial = words[0].charAt(0).toUpperCase();
  const lastInitial = words[words.length - 1].charAt(0).toUpperCase();

  return `${firstInitial}${lastInitial}`;
}

export function formatPersonSubtitle(
  jobTitle?: string | null,
  department?: string | null,
): string | null {
  const parts = [jobTitle?.trim(), department?.trim()].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : null;
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function nameFromEmail(email: string): string {
  const localPart = email.trim().split("@")[0] ?? "";
  const normalized = localPart.replace(/[._-]+/g, " ").trim();

  if (!normalized) {
    return email;
  }

  return normalized
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
