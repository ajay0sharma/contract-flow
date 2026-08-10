/** Shared page container — uses full AppShell main width with compact vertical padding. */
export const PAGE_CONTAINER_CLASS =
  "mx-auto w-full max-w-none min-w-0 px-5 py-5 lg:px-6 lg:py-6";

export const PAGE_HEADER_SPACING_CLASS = "mb-4";

export const PAGE_SECTION_SPACING_CLASS = "mt-6";

export const PAGE_SHELL_WIDTH_CLASS = {
  default: "max-w-none",
  narrow: "max-w-3xl",
  wide: "max-w-none",
  full: "max-w-full",
} as const;
