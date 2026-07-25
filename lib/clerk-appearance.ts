export const clerkAppearance = {
  variables: {
    colorPrimary: "#1d4ed8",
    colorText: "#111827",
    colorTextSecondary: "#334155",
    colorBackground: "#ffffff",
    colorInputBackground: "#ffffff",
    colorInputText: "#111827",
    colorNeutral: "#334155",
    borderRadius: "0.5rem",
  },
  elements: {
    card: "bg-white border border-slate-300 shadow-sm",
    headerTitle: "text-slate-900",
    headerSubtitle: "text-slate-600",
    socialButtonsBlockButton: "border-slate-300 text-slate-800",
    formFieldLabel: "text-slate-800",
    formFieldInput: "border-slate-300 text-slate-900 bg-white",
    footerActionLink: "text-blue-700 hover:text-blue-800",
  },
} as const;
