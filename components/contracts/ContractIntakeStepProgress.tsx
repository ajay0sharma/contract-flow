"use client";

export const INTAKE_FORM_STEPS = [
  "Contract type",
  "Select template",
  "Request details",
  "Counterparty details",
  "Financial details",
  "Template variables",
  "Attachments",
  "Review and submit",
] as const;

export const INTAKE_FORM_STEP_COUNT = INTAKE_FORM_STEPS.length;

interface ContractIntakeStepProgressProps {
  currentStep: number;
  variant?: "sidebar" | "bar";
}

export function ContractIntakeStepProgress({
  currentStep,
  variant = "sidebar",
}: ContractIntakeStepProgressProps) {
  const clampedStep = Math.min(
    Math.max(currentStep, 1),
    INTAKE_FORM_STEP_COUNT,
  );

  if (variant === "bar") {
    return (
      <nav
        aria-label="Contract intake progress"
        className="mb-8 overflow-x-auto"
      >
        <ol className="flex min-w-max items-start justify-between gap-2">
          {INTAKE_FORM_STEPS.map((label, index) => {
            const stepNumber = index + 1;
            const isComplete = stepNumber < clampedStep;
            const isCurrent = stepNumber === clampedStep;

            return (
              <li
                key={label}
                className="flex flex-1 flex-col items-center"
              >
                <div className="flex w-full items-center">
                  {index > 0 ? (
                    <div
                      className={`h-0.5 flex-1 ${
                        isComplete || isCurrent ? "bg-gray-300" : "bg-gray-200"
                      }`}
                    />
                  ) : (
                    <div className="flex-1" />
                  )}
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      isCurrent
                        ? "bg-[#4A7C59] text-white"
                        : isComplete
                          ? "bg-gray-300 text-white"
                          : "border-2 border-gray-200 bg-white text-gray-400"
                    }`}
                  >
                    {isComplete ? "✓" : stepNumber}
                  </span>
                  {index < INTAKE_FORM_STEPS.length - 1 ? (
                    <div
                      className={`h-0.5 flex-1 ${
                        isComplete ? "bg-gray-300" : "bg-gray-200"
                      }`}
                    />
                  ) : (
                    <div className="flex-1" />
                  )}
                </div>
                <p
                  className={`mt-2 max-w-[5.5rem] text-center text-xs ${
                    isCurrent
                      ? "font-medium text-gray-900"
                      : "text-gray-500"
                  }`}
                >
                  {label}
                </p>
              </li>
            );
          })}
        </ol>
      </nav>
    );
  }

  return (
    <nav
      aria-label="Contract intake progress"
      className="hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm lg:block"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        Progress
      </p>
      <p className="mt-2 text-sm font-medium text-gray-900">
        Step {clampedStep} of {INTAKE_FORM_STEP_COUNT}
      </p>
      <ol className="mt-5 space-y-3">
        {INTAKE_FORM_STEPS.map((label, index) => {
          const stepNumber = index + 1;
          const isComplete = stepNumber < clampedStep;
          const isCurrent = stepNumber === clampedStep;

          return (
            <li key={label} className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  isCurrent
                    ? "bg-[#4A7C59] text-white"
                    : isComplete
                      ? "bg-gray-300 text-white"
                      : "border-2 border-gray-200 text-gray-400"
                }`}
              >
                {isComplete ? "✓" : stepNumber}
              </span>
              <span
                className={`text-sm ${
                  isCurrent
                    ? "font-medium text-gray-900"
                    : isComplete
                      ? "text-gray-500"
                      : "text-gray-400"
                }`}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
