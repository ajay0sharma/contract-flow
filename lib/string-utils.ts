export function safeTrim(value: string | undefined | null): string {
  return value?.trim() ?? "";
}

export function isPopulated(value: string | undefined | null): boolean {
  return safeTrim(value).length > 0;
}
