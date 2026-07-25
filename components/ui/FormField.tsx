"use client";

import type { CSSProperties, InputHTMLAttributes } from "react";
import { useTier } from "@/components/providers/TierProvider";

interface FormFieldProps {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  hint?: string;
  required?: boolean;
}

export function FormField({
  label,
  htmlFor,
  children,
  hint,
  required = false,
}: FormFieldProps) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-sm font-medium text-gray-700"
      >
        {label}
        {required ? <span className="text-red-400"> *</span> : null}
      </label>
      {children}
      {hint ? <p className="helper-text mt-1">{hint}</p> : null}
    </div>
  );
}

export function useTierInputClassName(changed = false, hasError = false): string {
  const { tokens } = useTier();

  if (hasError) {
    return "w-full px-3 py-2.5 text-sm border border-red-300 rounded-xl bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400/25 focus:border-transparent transition-colors disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed";
  }

  return [
    "w-full px-3 py-2.5 text-sm border rounded-xl bg-white placeholder:text-gray-400",
    "focus:outline-none focus:ring-2 focus:border-transparent transition-colors",
    "disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed",
    changed ? "bg-amber-50 border-amber-300" : "border-gray-200",
  ].join(" ");
}

export function TierInput({
  className = "",
  changed = false,
  hasError = false,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  changed?: boolean;
  hasError?: boolean;
}) {
  const { tokens } = useTier();
  const baseClass = useTierInputClassName(changed, hasError);

  return (
    <input
      className={`${baseClass} ${className}`}
      style={
        {
          ["--tw-ring-color" as string]: `${tokens.bannerAccent}40`,
        } as CSSProperties
      }
      {...props}
    />
  );
}

export const inputClassName =
  "w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/25 focus:border-transparent transition-colors";

export const readOnlyInputClassName =
  "w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-500";

export const selectClassName =
  "w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/25 focus:border-transparent transition-colors";

export const textareaClassName =
  "w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/25 focus:border-transparent transition-colors";
