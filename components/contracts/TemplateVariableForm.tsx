"use client";

import {
  FormField,
  inputClassName,
  selectClassName,
} from "@/components/ui/FormField";
import type { TemplateVariableRecord } from "@/types/contract-template";

interface TemplateVariableFormProps {
  variables: TemplateVariableRecord[];
  values: Record<string, string>;
  error: string | null;
  onChange: (name: string, value: string) => void;
  onBack: () => void;
  onGenerate: () => void;
}

function inputTypeForField(
  fieldType: TemplateVariableRecord["fieldType"],
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

export function TemplateVariableForm({
  variables,
  values,
  error,
  onChange,
  onBack,
  onGenerate,
}: TemplateVariableFormProps) {
  return (
    <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Fill in template variables
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            Provide values for each field before generating the contract.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-muted"
        >
          Back
        </button>
      </div>

      <div className="mt-6 space-y-5">
        {variables.length > 0 ? (
          variables.map((variable) => (
            <FormField
              key={variable.name}
              label={variable.label}
              htmlFor={`template-var-${variable.name}`}
              hint={variable.helpText ?? `Variable: ${variable.name}`}
            >
              {variable.fieldType === "select" ? (
                <select
                  id={`template-var-${variable.name}`}
                  required={variable.isRequired}
                  value={values[variable.name] ?? ""}
                  onChange={(event) =>
                    onChange(variable.name, event.target.value)
                  }
                  className={selectClassName}
                >
                  <option value="">Select an option</option>
                  {(variable.selectOptions ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : variable.fieldType === "yes_no" ? (
                <select
                  id={`template-var-${variable.name}`}
                  required={variable.isRequired}
                  value={values[variable.name] ?? ""}
                  onChange={(event) =>
                    onChange(variable.name, event.target.value)
                  }
                  className={selectClassName}
                >
                  <option value="">Select</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              ) : (
                <input
                  id={`template-var-${variable.name}`}
                  type={inputTypeForField(variable.fieldType)}
                  required={variable.isRequired}
                  value={values[variable.name] ?? ""}
                  onChange={(event) =>
                    onChange(variable.name, event.target.value)
                  }
                  className={inputClassName}
                />
              )}
            </FormField>
          ))
        ) : (
          <p className="text-sm text-text-muted">
            This template has no variables. You can generate the contract
            directly.
          </p>
        )}
      </div>

      {error ? (
        <div className="mt-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onGenerate}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Generate contract
        </button>
      </div>
    </section>
  );
}
