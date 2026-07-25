import type { ReactNode } from "react";
import type { NavIconName } from "@/lib/navigation-config";
import { NavIcon } from "@/components/layout/NavIcon";
import { Button } from "@/components/ui/Button";

interface EmptyStateProps {
  icon?: NavIconName;
  heading: string;
  subtext?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  children?: ReactNode;
}

export function EmptyState({
  icon = "files",
  heading,
  subtext,
  actionLabel,
  onAction,
  children,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <NavIcon name={icon} className="h-12 w-12 text-gray-300" />
      <h3 className="mt-4 text-base font-medium text-gray-500">{heading}</h3>
      {subtext ? (
        <p className="mt-1 max-w-xs text-sm text-gray-400">{subtext}</p>
      ) : null}
      {actionLabel && onAction ? (
        <div className="mt-6">
          <Button onClick={onAction}>{actionLabel}</Button>
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div
      className={`h-32 w-full animate-pulse rounded-2xl bg-gray-100 ${className}`}
    />
  );
}

export function SkeletonRow({ className = "" }: { className?: string }) {
  return (
    <div
      className={`h-10 w-full animate-pulse rounded-xl bg-gray-100 ${className}`}
    />
  );
}

export function SkeletonText({ className = "w-3/4" }: { className?: string }) {
  return (
    <div
      className={`h-4 animate-pulse rounded-xl bg-gray-100 ${className}`}
    />
  );
}
