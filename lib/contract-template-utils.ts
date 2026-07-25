import type { TemplateVariableFieldType } from "@/lib/generated/prisma/enums";
import {
  CONTRACT_TEMPLATE_TYPES,
  TEMPLATE_VARIABLE_FIELD_TYPES,
  type SystemContractTemplateType,
  type TemplateVariableInput,
  type TemplateVariableRecord,
} from "@/types/contract-template";

export { findDefaultTemplateForType } from "@/lib/contract-template-intake";

const VARIABLE_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export function isSystemContractTemplateType(
  value: string,
): value is SystemContractTemplateType {
  return CONTRACT_TEMPLATE_TYPES.includes(
    value as SystemContractTemplateType,
  );
}

export function isValidTemplateVariableFieldType(
  value: string,
): value is TemplateVariableFieldType {
  return TEMPLATE_VARIABLE_FIELD_TYPES.includes(
    value as TemplateVariableFieldType,
  );
}

export function parseSelectOptions(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

export function parseTemplateVariableInputs(value: unknown): TemplateVariableInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const name = typeof record.name === "string" ? record.name.trim() : "";
      const label = typeof record.label === "string" ? record.label.trim() : "";
      const fieldType =
        typeof record.fieldType === "string" ? record.fieldType.trim() : "text";

      if (!name || !label || !isValidTemplateVariableFieldType(fieldType)) {
        return null;
      }

      const variable: TemplateVariableInput = {
        name: name.toUpperCase(),
        label,
        fieldType,
        isRequired:
          record.isRequired === undefined ? true : Boolean(record.isRequired),
        defaultValue:
          typeof record.defaultValue === "string"
            ? record.defaultValue
            : record.defaultValue === null
              ? null
              : undefined,
        helpText:
          typeof record.helpText === "string"
            ? record.helpText
            : record.helpText === null
              ? null
              : undefined,
        displayOrder:
          typeof record.displayOrder === "number"
            ? record.displayOrder
            : index,
      };

      if (fieldType === "select") {
        variable.selectOptions = parseSelectOptions(record.selectOptions);
      }

      return variable;
    })
    .filter((entry): entry is TemplateVariableInput => entry !== null)
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

export function validateTemplateVariables(
  variables: TemplateVariableInput[],
): string | null {
  const seen = new Set<string>();

  for (const variable of variables) {
    if (!VARIABLE_NAME_PATTERN.test(variable.name)) {
      return `Variable "${variable.name}" must use uppercase letters, numbers, and underscores.`;
    }

    if (seen.has(variable.name)) {
      return `Duplicate variable name "${variable.name}".`;
    }

    seen.add(variable.name);

    if (variable.fieldType === "select") {
      if (!variable.selectOptions || variable.selectOptions.length === 0) {
        return `Variable "${variable.name}" requires at least one select option.`;
      }
    }
  }

  return null;
}

export function buildGeneratedContractSummary(
  templateTitle: string,
  templateVersion: number,
  variables: TemplateVariableRecord[],
  values: Record<string, string>,
): string {
  const lines = [
    `Generated from template: ${templateTitle} (v${templateVersion})`,
    "",
    "The final Word document will be produced from the uploaded template file using the values below.",
    "",
  ];

  for (const variable of variables) {
    const value = values[variable.name]?.trim() || variable.defaultValue || "";
    lines.push(`${variable.label}: ${value || "[Not provided]"}`);
  }

  return lines.join("\n");
}

export function getDefaultValueForVariable(
  variable: TemplateVariableRecord,
): string {
  return variable.defaultValue?.trim() ?? "";
}

export const WORD_TEMPLATE_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);

export function isWordTemplateFile(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  return (
    lowerName.endsWith(".docx") ||
    lowerName.endsWith(".doc") ||
    WORD_TEMPLATE_MIME_TYPES.has(file.type)
  );
}
