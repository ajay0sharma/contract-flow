"use client";

import {
  CONTRACT_TEMPLATE_TYPE_LABELS,
  getContractTypeDescription,
  type ContractTypeRecord,
  type ContractTemplateType,
  type SystemContractTemplateType,
} from "@/types/contract-template";
import { CONTRACT_TEMPLATE_TYPES } from "@/types/contract-template";

interface ContractTypeCardPickerProps {
  contractTypes: ContractTypeRecord[];
  selectedType: ContractTemplateType | "";
  onSelect: (type: ContractTemplateType) => void;
  idPrefix?: string;
}

function isSystemContractType(
  slug: string,
): slug is SystemContractTemplateType {
  return CONTRACT_TEMPLATE_TYPES.includes(slug as SystemContractTemplateType);
}

export function ContractTypeIcon({
  type,
  className = "h-7 w-7 flex-shrink-0 text-blue-600",
}: {
  type: ContractTemplateType;
  className?: string;
}) {
  const systemPaths: Record<SystemContractTemplateType, string> = {
    vendor: "M4 7h16v3H4zm0 5h8v9H4zm10 0h6v9h-6z",
    customer: "M4 6h16v4H4zm0 6h10v8H4zm12 0h4v8h-4z",
    nda: "M7 3h10v18H7z M9 7h6 M9 11h6",
    employment: "M12 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm-7 16v-2a5 5 0 0 1 10 0v2",
    saas: "M5 8l7-4 7 4-7 4-7-4zm0 5l7 4 7-4",
    consulting: "M4 20l8-16 8 16z",
    partnership: "M8 12h8M12 8v8 M4 6h16v12H4z",
    other: "M6 6h12v12H6z",
  };

  const path = isSystemContractType(type)
    ? systemPaths[type]
    : "M8 3h8l4 4v14H8z M16 3v4h4 M10 13h6M10 17h4";

  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}

function getTypeCategoryLabel(slug: string): string {
  if (isSystemContractType(slug)) {
    return CONTRACT_TEMPLATE_TYPE_LABELS[slug];
  }

  return "Custom type";
}

export function ContractTypeCardPicker({
  contractTypes,
  selectedType,
  onSelect,
  idPrefix = "contract-type",
}: ContractTypeCardPickerProps) {
  if (contractTypes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
        No contract types are available for new requests. Your legal team can
        enable types from the legal dashboard intake settings.
      </div>
    );
  }

  return (
    <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-4 sm:gap-5">
      {contractTypes.map((type) => {
        const isSelected = selectedType === type.slug;
        const description = getContractTypeDescription(type.slug, contractTypes);

        return (
          <button
            key={type.id}
            id={`${idPrefix}-${type.slug}`}
            type="button"
            onClick={() => onSelect(type.slug)}
            className={
              isSelected
                ? "flex min-w-0 cursor-pointer flex-col items-start gap-2 rounded-xl border-2 border-blue-500 bg-blue-50 p-5 text-left transition-all"
                : "flex min-w-0 cursor-pointer flex-col items-start gap-2 rounded-xl border-2 border-gray-200 p-5 text-left transition-all hover:border-blue-300 hover:bg-blue-50"
            }
          >
            <ContractTypeIcon type={type.slug} />
            <h3 className="w-full text-sm font-semibold leading-snug text-gray-900">
              {type.label}
            </h3>
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
              {getTypeCategoryLabel(type.slug)}
            </p>
            <p className="w-full text-xs leading-relaxed text-gray-500">
              {description}
            </p>
          </button>
        );
      })}
    </div>
  );
}
