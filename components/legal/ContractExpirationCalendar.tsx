"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  buildMonthGrid,
  formatDisplayDate,
  formatMonthLabel,
  getTodayDateKey,
  groupExpirationsByDate,
  type ContractExpirationEntry,
} from "@/lib/contract-expiration";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface ContractExpirationsResponse {
  expirations: ContractExpirationEntry[];
  today: string;
}

function CalendarSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-6 h-8 w-48 rounded bg-gray-200" />
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 35 }).map((_, index) => (
          <div key={`calendar-skeleton-${index}`} className="h-20 rounded-lg bg-gray-100" />
        ))}
      </div>
    </div>
  );
}

export function ContractExpirationCalendar() {
  const todayKey = getTodayDateKey();
  const initialDate = new Date(`${todayKey}T12:00:00`);
  const [visibleYear, setVisibleYear] = useState(initialDate.getFullYear());
  const [visibleMonth, setVisibleMonth] = useState(initialDate.getMonth());
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(todayKey);
  const [expirations, setExpirations] = useState<ContractExpirationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/legal/contract-expirations", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Failed to load contract expirations.");
        }

        const data = (await response.json()) as ContractExpirationsResponse;

        if (!cancelled) {
          setExpirations(data.expirations ?? []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load contract expirations.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const expirationsByDate = useMemo(
    () => groupExpirationsByDate(expirations),
    [expirations],
  );

  const monthCells = useMemo(
    () => buildMonthGrid(visibleYear, visibleMonth),
    [visibleMonth, visibleYear],
  );

  const upcomingCount = useMemo(
    () => expirations.filter((entry) => entry.isUpcoming).length,
    [expirations],
  );

  const selectedEntries = selectedDateKey
    ? expirationsByDate.get(selectedDateKey) ?? []
    : [];

  function goToPreviousMonth(): void {
    if (visibleMonth === 0) {
      setVisibleYear((year) => year - 1);
      setVisibleMonth(11);
      return;
    }

    setVisibleMonth((month) => month - 1);
  }

  function goToNextMonth(): void {
    if (visibleMonth === 11) {
      setVisibleYear((year) => year + 1);
      setVisibleMonth(0);
      return;
    }

    setVisibleMonth((month) => month + 1);
  }

  function goToToday(): void {
    const today = new Date(`${todayKey}T12:00:00`);
    setVisibleYear(today.getFullYear());
    setVisibleMonth(today.getMonth());
    setSelectedDateKey(todayKey);
  }

  if (loading) {
    return <CalendarSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {formatMonthLabel(visibleYear, visibleMonth)}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {upcomingCount} upcoming contract expiration
              {upcomingCount === 1 ? "" : "s"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goToPreviousMonth}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={goToToday}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Today
            </button>
            <button
              type="button"
              onClick={goToNextMonth}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>

        <div className="mb-2 grid grid-cols-7 gap-2">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="px-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-400"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {monthCells.map((cell) => {
            const dayEntries = expirationsByDate.get(cell.dateKey) ?? [];
            const upcomingEntries = dayEntries.filter((entry) => entry.isUpcoming);
            const hasUpcoming = upcomingEntries.length > 0;
            const hasPastOnly = dayEntries.length > 0 && !hasUpcoming;
            const isToday = cell.dateKey === todayKey;
            const isSelected = cell.dateKey === selectedDateKey;

            return (
              <button
                key={`${cell.dateKey}-${cell.inCurrentMonth ? "current" : "adjacent"}`}
                type="button"
                onClick={() => setSelectedDateKey(cell.dateKey)}
                className={`min-h-20 rounded-xl border p-2 text-left transition-colors ${
                  hasUpcoming
                    ? "border-amber-300 bg-amber-50 hover:bg-amber-100"
                    : hasPastOnly
                      ? "border-gray-200 bg-gray-50 hover:bg-gray-100"
                      : cell.inCurrentMonth
                        ? "border-gray-100 bg-white hover:bg-gray-50"
                        : "border-transparent bg-gray-50/60 text-gray-400 hover:bg-gray-100"
                } ${isSelected ? "ring-2 ring-[#3558A0] ring-offset-1" : ""}`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span
                    className={`text-sm font-medium ${
                      cell.inCurrentMonth ? "text-gray-900" : "text-gray-400"
                    }`}
                  >
                    {cell.day}
                  </span>
                  {isToday ? (
                    <span className="rounded-full bg-[#3558A0] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      Today
                    </span>
                  ) : null}
                </div>

                {hasUpcoming ? (
                  <div className="mt-2 space-y-1">
                    <span className="inline-flex rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                      {upcomingEntries.length} expiring
                    </span>
                  </div>
                ) : null}

                {hasPastOnly ? (
                  <p className="mt-2 text-[10px] text-gray-500">
                    {dayEntries.length} past
                  </p>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-amber-300" />
            <span>Upcoming expiration</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-gray-300" />
            <span>Past expiration</span>
          </div>
        </div>
      </section>

      <aside className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900">
          {selectedDateKey ? formatDisplayDate(selectedDateKey) : "Select a day"}
        </h3>

        {selectedEntries.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">
            No contract expirations on this date.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {selectedEntries.map((entry) => (
              <li
                key={entry.id}
                className={`rounded-xl border px-4 py-3 ${
                  entry.isUpcoming
                    ? "border-amber-200 bg-amber-50"
                    : "border-gray-200 bg-gray-50"
                }`}
              >
                <Link
                  href={`/contracts/${entry.id}`}
                  className="text-sm font-semibold text-[#3558A0] hover:underline"
                >
                  {entry.recordNumber}
                </Link>
                <p className="mt-1 text-sm text-gray-900">{entry.title}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {entry.isUpcoming ? "Upcoming expiration" : "Past expiration"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
