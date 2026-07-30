import type {
  IntakeFormDefinitionRecord,
  IntakeFormFieldRecord,
  IntakeFormSectionRecord,
} from "@/types/intake-form";

export interface IntakeFormLayoutHelpers {
  layout: IntakeFormDefinitionRecord | null;
  isSectionVisible: (sectionKey: string) => boolean;
  isFieldVisible: (sectionKey: string, fieldKey: string) => boolean;
  getField: (
    sectionKey: string,
    fieldKey: string,
  ) => IntakeFormFieldRecord | null;
  getSection: (sectionKey: string) => IntakeFormSectionRecord | null;
  getSectionLabel: (sectionKey: string, fallback: string) => string;
  getSectionDescription: (
    sectionKey: string,
    fallback?: string,
  ) => string | undefined;
  getFieldLabel: (
    sectionKey: string,
    fieldKey: string,
    fallback: string,
  ) => string;
  isFieldRequired: (
    sectionKey: string,
    fieldKey: string,
    fallback: boolean,
  ) => boolean;
  getFieldHelpText: (
    sectionKey: string,
    fieldKey: string,
    fallback?: string,
  ) => string | undefined;
  customSections: () => IntakeFormSectionRecord[];
}

export function createIntakeFormLayoutHelpers(
  layout: IntakeFormDefinitionRecord | null,
): IntakeFormLayoutHelpers {
  function getSection(sectionKey: string): IntakeFormSectionRecord | null {
    if (!layout) {
      return null;
    }

    return layout.sections.find((section) => section.key === sectionKey) ?? null;
  }

  function getField(
    sectionKey: string,
    fieldKey: string,
  ): IntakeFormFieldRecord | null {
    const section = getSection(sectionKey);

    if (!section) {
      return null;
    }

    return section.fields.find((field) => field.key === fieldKey) ?? null;
  }

  return {
    layout,
    isSectionVisible(sectionKey) {
      if (!layout) {
        return true;
      }

      return layout.sections.some((section) => section.key === sectionKey);
    },
    isFieldVisible(sectionKey, fieldKey) {
      if (!layout) {
        return true;
      }

      return Boolean(getField(sectionKey, fieldKey));
    },
    getField,
    getSection,
    getSectionLabel(sectionKey, fallback) {
      return getSection(sectionKey)?.label ?? fallback;
    },
    getSectionDescription(sectionKey, fallback) {
      const description = getSection(sectionKey)?.description;

      if (description === null || description === undefined) {
        return fallback;
      }

      return description;
    },
    getFieldLabel(sectionKey, fieldKey, fallback) {
      return getField(sectionKey, fieldKey)?.label ?? fallback;
    },
    isFieldRequired(sectionKey, fieldKey, fallback) {
      const field = getField(sectionKey, fieldKey);

      if (!field) {
        return false;
      }

      return field.isRequired ?? fallback;
    },
    getFieldHelpText(sectionKey, fieldKey, fallback) {
      const helpText = getField(sectionKey, fieldKey)?.helpText;

      if (helpText === null || helpText === undefined) {
        return fallback;
      }

      return helpText;
    },
    customSections() {
      if (!layout) {
        return [];
      }

      return layout.sections
        .filter((section) => !section.isSystem)
        .sort((left, right) => left.displayOrder - right.displayOrder);
    },
  };
}
