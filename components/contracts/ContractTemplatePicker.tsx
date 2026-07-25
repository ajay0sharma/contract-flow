"use client";

import { useMemo, useState } from "react";
import type { ContractTemplateRecord, ContractTemplateType } from "@/types/contract-template";
import {
  templateMatchesSearch,
  templateMatchesTypeFilter,
} from "@/lib/contract-template-intake";
import { inputClassName } from "@/components/ui/FormField";

interface ContractTemplatePickerProps {
  templates: ContractTemplateRecord[];
  contractTypeFilter: ContractTemplateType | "";
  selectedTemplateId?: string | null;
  onSelect: (template: ContractTemplateRecord) => void;
  onSelectNoTemplate: () => void;
  onBack: () => void;
  backLabel?: string;
}

function TemplateFileIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-7 w-7 flex-shrink-0 text-blue-600"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 3h8l4 4v14H8z" />
      <path d="M16 3v4h4" />
      <path d="M10 13h6M10 17h4" />
    </svg>
  );
}

function NoTemplateIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-7 w-7 flex-shrink-0 text-gray-500"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 3h8l4 4v14H8z" />
      <path d="M16 3v4h4" />
      <path d="M9 12l6 6M15 12l-6 6" />
    </svg>
  );
}

export function ContractTemplatePicker({
  templates,
  contractTypeFilter,
  selectedTemplateId = null,
  onSelect,
  onSelectNoTemplate,
  onBack,
  backLabel = "Back",
}: ContractTemplatePickerProps) {
  const [query, setQuery] = useState("");

  const filteredTemplates = useMemo(
    () =>
      templates.filter(
        (template) =>
          templateMatchesSearch(template, query) &&
          templateMatchesTypeFilter(template, contractTypeFilter),
      ),
    [templates, query, contractTypeFilter],
  );

  return (
    <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Choose a template
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            Select a template for this contract type, or continue without one.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-muted"
        >
          {backLabel}
        </button>
      </div>

      <div className="mt-5">
        <label className="block text-sm">
          <span className="mb-2 block font-medium text-foreground">Search</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search templates"
            className={inputClassName}
          />
        </label>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        {filteredTemplates.map((template) => {
          const isSelected = selectedTemplateId === template.id;

          return (
            <button
              key={template.id}
              type="button"
              onClick={() => onSelect(template)}
              className={`flex min-h-0 w-full cursor-pointer flex-col items-start gap-2 rounded-xl border-2 p-5 text-left transition-all ${
                isSelected
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-blue-300 hover:bg-blue-50"
              }`}
            >
              <TemplateFileIcon />
              <div className="flex w-full flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold leading-snug text-gray-900">
                  {template.title}
                </h3>
                <span className="text-xs text-gray-500">v{template.version}</span>
                {template.isDefault ? (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                    Default
                  </span>
                ) : null}
              </div>
              {template.description ? (
                <p className="text-xs leading-relaxed text-gray-500">
                  {template.description}
                </p>
              ) : null}
            </button>
          );
        })}

        <button
          type="button"
          onClick={onSelectNoTemplate}
          className="flex min-h-0 w-full cursor-pointer flex-col items-start gap-2 rounded-xl border-2 border-dashed border-gray-300 p-5 text-left transition-all hover:border-gray-400 hover:bg-gray-50"
        >
          <NoTemplateIcon />
          <h3 className="text-sm font-semibold leading-snug text-gray-900">
            No template
          </h3>
          <p className="text-xs leading-relaxed text-gray-500">
            Continue without a template. Legal will prepare the document
            manually.
          </p>
        </button>
      </div>
    </section>
  );
}
