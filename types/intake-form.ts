import type { TemplateVariableFieldType } from "@/types/contract-template";

export interface IntakeFormFieldRecord {
  id: string;
  sectionId: string;
  key: string;
  label: string;
  fieldType: TemplateVariableFieldType;
  isRequired: boolean;
  isSystem: boolean;
  displayOrder: number;
  helpText: string | null;
  placeholder: string | null;
  selectOptions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface IntakeFormSectionRecord {
  id: string;
  formId: string;
  key: string;
  label: string;
  description: string | null;
  displayOrder: number;
  isSystem: boolean;
  fields: IntakeFormFieldRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface IntakeFormDefinitionRecord {
  id: string;
  organizationId: string;
  name: string;
  isActive: boolean;
  sections: IntakeFormSectionRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface IntakeFormFieldInput {
  key: string;
  label: string;
  fieldType: TemplateVariableFieldType;
  isRequired?: boolean;
  isSystem?: boolean;
  displayOrder: number;
  helpText?: string | null;
  placeholder?: string | null;
  selectOptions?: string[];
}

export interface IntakeFormSectionInput {
  key: string;
  label: string;
  description?: string | null;
  displayOrder: number;
  isSystem?: boolean;
  fields: IntakeFormFieldInput[];
}

export interface SaveIntakeFormInput {
  organizationId: string;
  name?: string;
  sections: IntakeFormSectionInput[];
}
