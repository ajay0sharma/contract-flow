import type { AuditEvent, WorkflowStep } from "@/types/contract";

const stepStyles = {
  completed: {
    dot: "bg-emerald-500 ring-emerald-100",
    line: "bg-emerald-200",
    badge: "bg-emerald-50 text-emerald-800",
    label: "Completed",
  },
  current: {
    dot: "bg-blue-500 ring-blue-100",
    line: "bg-slate-200",
    badge: "bg-blue-50 text-blue-800",
    label: "In progress",
  },
  upcoming: {
    dot: "bg-slate-300 ring-slate-100",
    line: "bg-slate-200",
    badge: "bg-slate-100 text-slate-600",
    label: "Upcoming",
  },
  skipped: {
    dot: "bg-slate-300 ring-slate-100",
    line: "bg-slate-200",
    badge: "bg-slate-100 text-slate-500",
    label: "Skipped",
  },
  rejected: {
    dot: "bg-rose-500 ring-rose-100",
    line: "bg-rose-200",
    badge: "bg-rose-50 text-rose-800",
    label: "Rejected",
  },
} as const;

interface LifecycleTimelineProps {
  steps: WorkflowStep[];
}

export function LifecycleTimeline({ steps }: LifecycleTimelineProps) {
  return (
    <ol className="space-y-0">
      {steps.map((step, index) => {
        const styles = stepStyles[step.status];
        const isLast = index === steps.length - 1;

        return (
          <li key={step.id} className="relative flex gap-4 pb-8 last:pb-0">
            {!isLast ? (
              <span
                className={`absolute left-[11px] top-6 h-[calc(100%-12px)] w-0.5 ${styles.line}`}
                aria-hidden="true"
              />
            ) : null}

            <span
              className={`relative z-10 mt-1 h-6 w-6 shrink-0 rounded-full ring-4 ${styles.dot}`}
              aria-hidden="true"
            />

            <div className="min-w-0 flex-1 rounded-xl border border-border bg-surface p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">{step.name}</p>
                  <p className="text-sm text-text-secondary">
                    {step.role} · {step.assigneeName}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${styles.badge}`}
                >
                  {styles.label}
                </span>
              </div>

              {step.completedAt ? (
                <p className="mt-2 text-xs text-text-muted">
                  {step.status === "rejected" ? "Rejected" : "Completed"} on{" "}
                  {step.completedAt}
                </p>
              ) : null}

              {step.note ? (
                <p className="mt-3 rounded-lg bg-surface-muted px-3 py-2 text-sm text-text-secondary">
                  {step.note}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

interface AuditTrailProps {
  events: AuditEvent[];
}

export function AuditTrail({ events }: AuditTrailProps) {
  return (
    <ol className="space-y-3">
      {[...events].reverse().map((event) => (
        <li
          key={event.id}
          className="rounded-lg border border-border bg-surface px-4 py-3 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">{event.action}</p>
            <p className="text-xs text-text-muted">
              {new Date(event.timestamp).toLocaleString()}
            </p>
          </div>
          <p className="mt-1 text-sm text-text-secondary">{event.detail}</p>
          <p className="mt-1 text-xs text-text-muted">
            {event.actorName} · {event.actorEmail}
          </p>
        </li>
      ))}
    </ol>
  );
}
