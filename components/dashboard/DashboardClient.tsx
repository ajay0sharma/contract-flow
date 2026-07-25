"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { NavIcon } from "@/components/layout/NavIcon";
import { StageBadge } from "@/components/contracts/StageBadge";
import { EmptyState, SkeletonCard, SkeletonRow } from "@/components/ui/EmptyState";
import { isSupportEmail } from "@/lib/legal-access";
import type { ContractRecord, ContractStage } from "@/types/contract";

interface DashboardClientProps {
  displayName: string;
}

const ACTIVE_REQUEST_EXCLUDED_STAGES: ContractStage[] = ["active", "rejected"];

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getGreeting(): string {
  const hour = new Date().getHours();

  if (hour < 12) {
    return "Good morning";
  }

  if (hour < 17) {
    return "Good afternoon";
  }

  return "Good evening";
}

function isCompletedThisMonth(contract: ContractRecord): boolean {
  const date = new Date(contract.updatedAt);
  const now = new Date();

  return (
    (contract.stage === "active" || contract.contractStatus === "active") &&
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
}

async function fetchContracts(path: string): Promise<ContractRecord[]> {
  const response = await fetch(path, { cache: "no-store" });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(data?.error ?? "Failed to load contracts");
  }

  return (await response.json()) as ContractRecord[];
}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
  iconColor,
}: {
  title: string;
  value: number;
  subtitle: string;
  icon: "files" | "bell" | "circle-check";
  iconColor: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{title}</p>
        <span style={{ color: iconColor }}>
          {icon === "circle-check" ? (
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          ) : (
            <NavIcon name={icon} className="h-5 w-5" />
          )}
        </span>
      </div>
      <p className="text-3xl font-light text-gray-900">{value}</p>
      <p className="text-xs text-gray-400">{subtitle}</p>
    </div>
  );
}

export function DashboardClient({ displayName }: DashboardClientProps) {
  const { user } = useUser();
  const [hasMounted, setHasMounted] = useState(false);
  const [myRequests, setMyRequests] = useState<ContractRecord[]>([]);
  const [assignedToMe, setAssignedToMe] = useState<ContractRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const firstName = displayName.trim().split(/\s+/)[0] ?? displayName;

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [mine, assigned] = await Promise.all([
        fetchContracts("/api/contracts"),
        fetchContracts("/api/contracts?assignedToMe=true"),
      ]);

      setMyRequests(mine);
      setAssignedToMe(assigned);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load dashboard data",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const email = hasMounted
    ? user?.primaryEmailAddress?.emailAddress ?? ""
    : "";
  const canCreateRequests = hasMounted ? !isSupportEmail(email) : true;

  const summary = useMemo(() => {
    const myActiveRequests = myRequests.filter(
      (contract) => !ACTIVE_REQUEST_EXCLUDED_STAGES.includes(contract.stage),
    ).length;

    const completedThisMonth = myRequests.filter(isCompletedThisMonth).length;

    return {
      myActiveRequests,
      awaitingMyInput: assignedToMe.length,
      completedThisMonth,
    };
  }, [myRequests, assignedToMe]);

  const recentRequests = useMemo(
    () =>
      [...myRequests]
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )
        .slice(0, 10),
    [myRequests],
  );

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {getGreeting()}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-gray-500">{todayLabel}</p>
        </div>
        {canCreateRequests ? (
          <Link
            href="/contracts/new"
            className="flex items-center gap-2 rounded-xl bg-[#4A7C59] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#3D6B4A]"
          >
            <NavIcon name="plus" className="h-4 w-4" />
            New request
          </Link>
        ) : null}
      </div>

      {error ? (
        <div className="mb-6 rounded-2xl border border-red-100 bg-white px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <MetricCard
              title="My active requests"
              value={summary.myActiveRequests}
              subtitle="In the approval workflow"
              icon="files"
              iconColor="#4A7C59"
            />
            <MetricCard
              title="Awaiting my input"
              value={summary.awaitingMyInput}
              subtitle="Contracts needing attention"
              icon="bell"
              iconColor="#D97706"
            />
            <MetricCard
              title="Completed this month"
              value={summary.completedThisMonth}
              subtitle="Approved and executed"
              icon="circle-check"
              iconColor="#4A7C59"
            />
          </>
        )}
      </div>

      <section className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            Recent requests
          </h2>
        </div>

        {loading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonRow key={index} />
            ))}
          </div>
        ) : recentRequests.length === 0 ? (
          <EmptyState
            heading="No requests yet"
            subtext="Submit your first contract request to get started."
            actionLabel="New request"
            onAction={() => {
              window.location.href = "/contracts/new";
            }}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-gray-400">
                    <th className="px-6 py-3 text-left font-medium">Record</th>
                    <th className="px-6 py-3 text-left font-medium">Title</th>
                    <th className="px-6 py-3 text-left font-medium">
                      Counterparty
                    </th>
                    <th className="px-6 py-3 text-left font-medium">Stage</th>
                    <th className="px-6 py-3 text-left font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recentRequests.map((contract) => (
                    <tr
                      key={contract.id}
                      className="text-sm text-gray-700 hover:bg-gray-50/50"
                    >
                      <td className="px-6 py-3">
                        <Link
                          href={`/contracts/${contract.id}`}
                          className="font-medium text-[#4A7C59] hover:underline"
                        >
                          {contract.recordNumber}
                        </Link>
                      </td>
                      <td className="px-6 py-3">
                        <Link
                          href={`/contracts/${contract.id}`}
                          className="hover:text-gray-900"
                        >
                          {contract.title}
                        </Link>
                      </td>
                      <td className="px-6 py-3">
                        {contract.companyName || "—"}
                      </td>
                      <td className="px-6 py-3">
                        <StageBadge stage={contract.stage} />
                      </td>
                      <td className="px-6 py-3 text-gray-500">
                        {formatDate(contract.updatedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end border-t border-gray-100 px-6 py-3">
              <Link
                href="/search"
                className="text-sm font-medium text-[#4A7C59] hover:underline"
              >
                View all
              </Link>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
