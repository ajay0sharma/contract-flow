"use client";

import { useRouter } from "next/navigation";
import {
  getContractTypeLabel,
  type SystemContractTemplateType,
} from "@/types/contract-template";
import { isSystemContractTemplateType } from "@/lib/contract-template-utils";
import type {
  RelationshipNode,
  RelationshipTreeResponse,
} from "@/types/contract-relationships";

interface ContractRelationshipTreeProps {
  data?: RelationshipTreeResponse | null;
  isLoading?: boolean;
  error?: boolean;
}

const CONTRACT_TYPE_BADGE_STYLES: Record<SystemContractTemplateType, string> = {
  vendor: "bg-purple-100 text-purple-700",
  customer: "bg-teal-100 text-teal-700",
  nda: "bg-blue-100 text-blue-700",
  employment: "bg-pink-100 text-pink-700",
  saas: "bg-violet-100 text-violet-700",
  consulting: "bg-orange-100 text-orange-700",
  partnership: "bg-indigo-100 text-indigo-700",
  other: "bg-gray-100 text-gray-600",
};

const STATUS_STYLES: Record<
  string,
  { dot: string; label: string }
> = {
  active: { dot: "bg-[#22C55E]", label: "Active" },
  pending: { dot: "bg-[#F59E0B]", label: "Pending" },
  rejected: { dot: "bg-[#EF4444]", label: "Rejected" },
  expired: { dot: "bg-[#9CA3AF]", label: "Expired" },
  draft: { dot: "bg-[#9CA3AF]", label: "Draft" },
};

function resolveTemplateType(contractType: string): SystemContractTemplateType {
  const normalized = contractType.trim().toLowerCase();

  if (isSystemContractTemplateType(normalized)) {
    return normalized;
  }

  if (normalized.includes("nda")) return "nda";
  if (normalized.includes("saas") || normalized.includes("software")) {
    return "saas";
  }
  if (normalized.includes("consult")) return "consulting";
  if (normalized.includes("employ")) return "employment";
  if (normalized.includes("partner")) return "partnership";
  if (normalized.includes("customer") || normalized.includes("client")) {
    return "customer";
  }
  if (
    normalized.includes("vendor") ||
    normalized.includes("supplier") ||
    normalized.includes("master")
  ) {
    return "vendor";
  }

  return "other";
}

function formatAmount(amountNumeric: number | null): string | null {
  if (amountNumeric == null || amountNumeric <= 0) {
    return null;
  }

  return `$${amountNumeric.toLocaleString("en-US", {
    maximumFractionDigits: 0,
  })}`;
}

function StatusIndicator({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.pending;

  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-600">
      <span className={`h-2 w-2 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

function VerticalLine({
  height = 24,
  color = "#E5E7EB",
}: {
  height?: number;
  color?: string;
}) {
  return (
    <div
      className="w-0.5"
      style={{ height, backgroundColor: color }}
      aria-hidden="true"
    />
  );
}

function BranchConnector({
  nodeCount,
  highlightIndex,
}: {
  nodeCount: number;
  highlightIndex?: number;
}) {
  if (nodeCount <= 1) {
    return (
      <VerticalLine
        height={24}
        color={highlightIndex === 0 ? "#3B82F6" : "#E5E7EB"}
      />
    );
  }

  const width = Math.max(220 * nodeCount, 220);

  return (
    <svg
      width={width}
      height={28}
      viewBox={`0 0 ${width} 28`}
      className="overflow-visible"
      aria-hidden="true"
    >
      <line
        x1={width / 2}
        y1={0}
        x2={width / 2}
        y2={12}
        stroke={highlightIndex != null ? "#3B82F6" : "#E5E7EB"}
        strokeWidth={2}
      />
      <line
        x1={width / (nodeCount * 2)}
        y1={12}
        x2={width - width / (nodeCount * 2)}
        y2={12}
        stroke="#E5E7EB"
        strokeWidth={2}
      />
      {Array.from({ length: nodeCount }).map((_, index) => {
        const x = (width / (nodeCount + 1)) * (index + 1);
        const isHighlighted = highlightIndex === index;

        return (
          <line
            key={`branch-${index}`}
            x1={x}
            y1={12}
            x2={x}
            y2={28}
            stroke={isHighlighted ? "#3B82F6" : "#E5E7EB"}
            strokeWidth={2}
          />
        );
      })}
    </svg>
  );
}

function RelationshipNodeCard({
  node,
  variant = "default",
  label,
}: {
  node: RelationshipNode;
  variant?: "default" | "ancestor" | "current";
  label?: string;
}) {
  const router = useRouter();
  const templateType = resolveTemplateType(node.contractType);
  const badgeLabel = getContractTypeLabel(node.contractType);
  const amount = formatAmount(node.amountNumeric);

  const baseClass =
    variant === "current"
      ? "cursor-default rounded-lg border-2 border-blue-500 bg-blue-50 p-3"
      : variant === "ancestor"
        ? "cursor-pointer rounded-lg border border-gray-200 bg-gray-50 p-3 transition-all duration-150 hover:border-gray-300 hover:shadow-md"
        : "cursor-pointer rounded-lg border border-gray-200 bg-white p-3 transition-all duration-150 hover:border-gray-300 hover:shadow-md";

  function handleClick(): void {
    if (node.isCurrent) {
      return;
    }

    router.push(`/contracts/${node.id}`);
  }

  return (
    <div className="flex min-w-[180px] max-w-[220px] flex-col items-center">
      {label ? (
        <p
          className={`mb-1 text-xs ${
            variant === "current" ? "text-blue-500" : "text-gray-400"
          }`}
        >
          {label}
        </p>
      ) : null}
      <button
        type="button"
        onClick={handleClick}
        disabled={node.isCurrent}
        className={`${baseClass} w-full text-left`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="font-mono text-xs text-gray-400">
            {node.recordNumber}
          </span>
          <StatusIndicator status={node.contractStatus} />
        </div>

        <p
          className="mt-2 line-clamp-2 text-xs font-medium text-gray-800"
          title={node.title}
        >
          {node.title}
        </p>

        <span
          className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${CONTRACT_TYPE_BADGE_STYLES[templateType]}`}
        >
          {badgeLabel}
        </span>

        {amount ? <p className="mt-1 text-xs text-gray-500">{amount}</p> : null}

        {node.isCurrent ? (
          <span className="mt-2 inline-block rounded bg-blue-500 px-2 py-0.5 text-xs text-white">
            Viewing
          </span>
        ) : null}
      </button>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex gap-4">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={`relationship-skeleton-${index}`}
          className="min-w-[180px] max-w-[220px] animate-pulse rounded-lg border border-gray-200 bg-white p-3"
        >
          <div className="h-3 w-16 rounded bg-gray-200" />
          <div className="mt-3 h-4 w-full rounded bg-gray-200" />
          <div className="mt-2 h-4 w-3/4 rounded bg-gray-200" />
          <div className="mt-3 h-5 w-20 rounded-full bg-gray-200" />
        </div>
      ))}
    </div>
  );
}

function currentNodeFromData(
  data: RelationshipTreeResponse,
): RelationshipNode {
  return {
    id: data.currentContract.id,
    recordNumber: data.currentContract.recordNumber,
    title: data.currentContract.title,
    contractType: data.currentContract.contractType,
    stage: data.currentContract.stage,
    contractStatus: data.currentContract.contractStatus,
    amountNumeric: data.currentContract.amountNumeric,
    counterpartyName: data.currentContract.counterpartyName,
    createdAt: "",
    isCurrent: true,
  };
}

export function ContractRelationshipTree({
  data,
  isLoading = false,
  error = false,
}: ContractRelationshipTreeProps) {
  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error || !data) {
    return (
      <p className="text-sm text-gray-500">
        Unable to load relationship data.
      </p>
    );
  }

  const currentNode = currentNodeFromData(data);
  const currentAndSiblings = [currentNode, ...data.siblings];
  const currentRowIndex = 0;

  return (
    <div className="overflow-x-auto pb-2">
      <div className="mx-auto flex min-w-max flex-col items-center py-2">
        {data.grandparent ? (
          <>
            <RelationshipNodeCard node={data.grandparent} variant="ancestor" />
            <VerticalLine />
          </>
        ) : null}

        {data.parent ? (
          <>
            <RelationshipNodeCard node={data.parent} variant="ancestor" />
            <BranchConnector
              nodeCount={currentAndSiblings.length}
              highlightIndex={currentRowIndex}
            />
          </>
        ) : null}

        <div className="flex items-start gap-4">
          {currentAndSiblings.map((node, index) => (
            <RelationshipNodeCard
              key={node.id}
              node={node}
              variant={node.isCurrent ? "current" : "default"}
              label={
                node.isCurrent
                  ? "You are here"
                  : index > 0
                    ? "Sibling"
                    : undefined
              }
            />
          ))}
        </div>

        {data.children.length > 0 ? (
          <>
            <BranchConnector
              nodeCount={data.children.length}
              highlightIndex={
                data.children.length === 1 ? 0 : undefined
              }
            />
            <div className="flex items-start gap-4">
              {data.children.map((child) => {
                const grandchildNodes = data.grandchildren[child.id] ?? [];

                return (
                  <div
                    key={child.id}
                    className="flex flex-col items-center gap-0"
                  >
                    <RelationshipNodeCard node={child} />
                    {grandchildNodes.length > 0 ? (
                      <>
                        <VerticalLine />
                        <div className="flex items-start gap-4">
                          {grandchildNodes.map((grandchild) => (
                            <RelationshipNodeCard
                              key={grandchild.id}
                              node={grandchild}
                            />
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
