"use client";

import {
  FormField,
  inputClassName,
  selectClassName,
  textareaClassName,
} from "@/components/ui/FormField";
import type { IntakeFormSectionRecord } from "@/types/intake-form";

interface CustomIntakeSectionsProps {
  sections: IntakeFormSectionRecord[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

function inputTypeForField(
  fieldType: IntakeFormSectionRecord["fields"][number]["fieldType"],
): string {
  switch (fieldType) {
    case "date":
      return "date";
    case "number":
    case "currency":
      return "number";
    case "email":
      return "email";
    default:
      return "text";
  }
}

export function CustomIntakeSections({
  sections,
  values,
  onChange,
}: CustomIntakeSectionsProps) {
  if (sections.length === 0) {
    return null;
  }

  return (
    <>
      {sections.map((section) => (
        <section
          key={section.id}
          className="rounded-lg border border-border bg-surface p-6 shadow-sm"
        >
          <h2 className="text-base font-semibold text-foreground">
            {section.label}
          </h2>
          {section.description ? (
            <p className="mt-1 text-sm text-text-muted">{section.description}</p>
          ) : null}

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            {[...section.fields]
              .sort((left, right) => left.displayOrder - right.displayOrder)
              .map((field) => (
                <div
                  key={field.id}
                  className={
                    field.fieldType === "text" && !field.isSystem
                      ? "md:col-span-2"
                      : undefined
                  }
                >
                  <FormField
                    label={field.label}
                    htmlFor={`custom-intake-${field.key}`}
                    hint={field.helpText ?? undefined}
                  >
                    {field.fieldType === "select" ? (
                      <select
                        id={`custom-intake-${field.key}`}
                        required={field.isRequired}
                        value={values[field.key] ?? ""}
                        onChange={(event) =>
                          onChange(field.key, event.target.value)
                        }
                        className={selectClassName}
                      >
                        <option value="">Select an option</option>
                        {field.selectOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : field.fieldType === "yes_no" ? (
                      <select
                        id={`custom-intake-${field.key}`}
                        required={field.isRequired}
                        value={values[field.key] ?? ""}
                        onChange={(event) =>
                          onChange(field.key, event.target.value)
                        }
                        className={selectClassName}
                      >
                        <option value="">Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    ) : field.fieldType === "text" && !field.isSystem ? (
                      <textarea
                        id={`custom-intake-${field.key}`}
                        required={field.isRequired}
                        rows={3}
                        placeholder={field.placeholder ?? undefined}
                        value={values[field.key] ?? ""}
                        onChange={(event) =>
                          onChange(field.key, event.target.value)
                        }
                        className={textareaClassName}
                      />
                    ) : (
                      <input
                        id={`custom-intake-${field.key}`}
                        type={inputTypeForField(field.fieldType)}
                        required={field.isRequired}
                        placeholder={field.placeholder ?? undefined}
                        value={values[field.key] ?? ""}
                        onChange={(event) =>
                          onChange(field.key, event.target.value)
                        }
                        className={inputClassName}
                      />
                    )}
                  </FormField>
                </div>
              ))}
          </div>
        </section>
      ))}
    </>
  );
}
