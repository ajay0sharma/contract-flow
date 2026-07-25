"use client";

import { type ButtonHTMLAttributes } from "react";
import { useTier } from "@/components/providers/TierProvider";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "default" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs rounded-lg",
  default: "px-4 py-2 text-sm rounded-xl",
  lg: "px-5 py-2.5 text-base rounded-xl",
};

export function Button({
  variant = "primary",
  size = "default",
  className = "",
  style,
  children,
  ...props
}: ButtonProps) {
  const { tokens } = useTier();

  const variantClasses: Record<ButtonVariant, string> = {
    primary: "text-white hover:opacity-90 disabled:opacity-50",
    secondary:
      "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50",
    danger: "bg-red-600 text-white hover:bg-red-700 disabled:opacity-50",
    ghost: "text-gray-600 hover:bg-gray-50 disabled:opacity-50",
  };

  const primaryStyle =
    variant === "primary"
      ? { backgroundColor: tokens.bannerAccent, ...style }
      : style;

  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 font-medium transition-colors ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      style={primaryStyle}
      {...props}
    >
      {children}
    </button>
  );
}

export function getTierInputClassName(tierAccent: string, changed = false): string {
  return [
    "w-full px-3 py-2.5 text-sm border rounded-xl bg-white placeholder:text-gray-400",
    "focus:outline-none focus:ring-2 focus:border-transparent transition-colors",
    changed ? "bg-amber-50 border-amber-300" : "border-gray-200",
    `focus:ring-[${tierAccent}]/25`,
  ].join(" ");
}
