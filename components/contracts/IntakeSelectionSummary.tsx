"use client";

import {
  ContractTypeIcon,
} from "@/components/contracts/ContractTypeCardPicker";
import { resolveCompanyContractType } from "@/lib/contract-template-intake";
import type { CompanyConfig } from "@/lib/company-config";
import {
  getContractTypeLabel,
  type ContractTemplateRecord,
  type ContractTemplateType,
} from "@/types/contract-template";

const summaryCardClassName =
  "flex w-full max-w-sm flex-col items-start gap-2 rounded-xl border-2 p-5";

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

interface SelectedContractTypeCardProps {
  companyConfig: CompanyConfig;
  contractType: ContractTemplateType;
  onChange: () => void;
}

export function SelectedContractTypeCard({
  companyConfig,
  contractType,
  onChange,
}: SelectedContractTypeCardProps) {
  const typeName = resolveCompanyContractType(contractType, companyConfig);

  return (
    <div
      className={`${summaryCardClassName} border-blue-500 bg-blue-50`}
    >
      <ContractTypeIcon type={contractType} />
      <h3 className="text-sm font-semibold leading-snug text-gray-900">
        {typeName}
      </h3>
      <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
        {getContractTypeLabel(contractType)}
      </p>
      <button
        type="button"
        onClick={onChange}
        className="cursor-pointer text-xs text-blue-500 underline"
      >
        Change
      </button>
    </div>
  );
}

export function SelectedTemplateSummaryCard({
  template,
}: {
  template: ContractTemplateRecord;
}) {
  return (
    <div className={`${summaryCardClassName} border-blue-500 bg-blue-50`}>
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
    </div>
  );
}

export function NoTemplateSummaryCard() {
  return (
    <div
      className={`${summaryCardClassName} border-gray-400 border-dashed bg-gray-50`}
    >
      <NoTemplateIcon />
      <h3 className="text-sm font-semibold leading-snug text-gray-900">
        No template
      </h3>
      <p className="text-xs leading-relaxed text-gray-500">
        Continue without a template. Legal will prepare the document manually.
      </p>
    </div>
  );
}
