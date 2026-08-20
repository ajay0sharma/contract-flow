import { listClauses } from "@/lib/clause-library-store";
import type { ClauseRecord } from "@/types/clause-library";
import type { LegalReviewDeviation } from "@/types/legal-review";

function normalizeClauseText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function findClauseExcerpt(text: string, clauseText: string): string | null {
  const normalizedText = normalizeClauseText(text);
  const normalizedClause = normalizeClauseText(clauseText);
  const clauseWords = normalizedClause.split(" ").filter(Boolean);

  if (clauseWords.length < 6) {
    return normalizedText.includes(normalizedClause) ? clauseText : null;
  }

  const anchor = clauseWords.slice(0, 8).join(" ");
  const anchorIndex = normalizedText.indexOf(anchor);

  if (anchorIndex === -1) {
    return null;
  }

  const start = Math.max(0, text.toLowerCase().indexOf(anchor));
  const end = Math.min(text.length, start + Math.max(clauseText.length, 240));

  return text.slice(start, end).trim();
}

function clauseMatchesContractType(
  clause: ClauseRecord,
  contractType: string,
): boolean {
  if (clause.contractTypes.length === 0) {
    return true;
  }

  const normalizedContractType = contractType.trim().toLowerCase();

  return clause.contractTypes.some(
    (entry) => entry.trim().toLowerCase() === normalizedContractType,
  );
}

function buildClauseDeviation(
  clause: ClauseRecord,
  usedText: string,
  approvedText: string,
  createdAt: string,
): LegalReviewDeviation {
  const priority =
    clause.status === "non_standard" || clause.category === "Liability"
      ? "critical"
      : clause.status === "approved_with_modification"
        ? "high"
        : "medium";

  return {
    id: `dev-clause-${clause.id}`,
    kind: "clause_deviation",
    title: `Approved clause deviation: ${clause.title}`,
    summary: `Final counterparty text differs from the approved ${clause.category.toLowerCase()} clause in the clause library.`,
    priority,
    status: "open",
    baselineExcerpt: approvedText,
    counterpartyExcerpt: usedText,
    clauseId: clause.id,
    clauseTitle: clause.title,
    approvedClauseText: approvedText,
    createdAt,
  };
}

export async function detectClauseDeviations(options: {
  organizationId: string;
  contractType: string;
  counterpartyText: string;
}): Promise<LegalReviewDeviation[]> {
  const clauses = await listClauses(options.organizationId);
  const applicable = clauses.filter(
    (clause) =>
      clause.status !== "deprecated" &&
      clauseMatchesContractType(clause, options.contractType),
  );
  const createdAt = new Date().toISOString();
  const deviations: LegalReviewDeviation[] = [];

  for (const clause of applicable) {
    const approvedText = clause.preferredText.trim();

    if (!approvedText) {
      continue;
    }

    const usedExcerpt = findClauseExcerpt(options.counterpartyText, approvedText);

    if (!usedExcerpt) {
      continue;
    }

    if (
      normalizeClauseText(usedExcerpt) === normalizeClauseText(approvedText)
    ) {
      continue;
    }

    deviations.push(
      buildClauseDeviation(clause, usedExcerpt, approvedText, createdAt),
    );
  }

  return deviations;
}
