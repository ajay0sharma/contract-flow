"use client";

import { useEffect, useState } from "react";
import { NavIcon } from "@/components/layout/NavIcon";

export type ToastType = "success" | "error" | "info";

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  body?: string;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

const toastStyles: Record<
  ToastType,
  { border: string; iconColor: string; icon: "circle-check" | "alert-circle" | "info-circle" }
> = {
  success: {
    border: "border-green-100",
    iconColor: "text-green-500",
    icon: "circle-check",
  },
  error: {
    border: "border-red-100",
    iconColor: "text-red-500",
    icon: "alert-circle",
  },
  info: {
    border: "border-blue-100",
    iconColor: "text-blue-500",
    icon: "info-circle",
  },
};

function ToastIcon({
  type,
  className,
}: {
  type: ToastType;
  className: string;
}) {
  if (type === "success") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    );
  }

  if (type === "error") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4M12 16h.01" />
      </svg>
    );
  }

  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8h.01M12 12v4" />
    </svg>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}) {
  const style = toastStyles[toast.type];

  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), 4000);
    return () => window.clearTimeout(timer);
  }, [onDismiss, toast.id]);

  return (
    <div
      className={`flex min-w-72 max-w-sm items-start gap-3 rounded-2xl border bg-white p-4 shadow-lg animate-in slide-in-from-right ${style.border}`}
      role="status"
    >
      <ToastIcon type={toast.type} className={`mt-0.5 h-5 w-5 shrink-0 ${style.iconColor}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900">{toast.title}</p>
        {toast.body ? (
          <p className="mt-0.5 text-xs text-gray-500">{toast.body}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="rounded-lg p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
        aria-label="Dismiss notification"
      >
        <NavIcon name="x" className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex max-w-sm flex-col gap-3">
      {toasts.slice(0, 3).map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  function dismissToast(id: string): void {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  function showToast(
    type: ToastType,
    title: string,
    body?: string,
  ): void {
    setToasts((current) => [
      ...current,
      {
        id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type,
        title,
        body,
      },
    ]);
  }

  return { toasts, dismissToast, showToast };
}
