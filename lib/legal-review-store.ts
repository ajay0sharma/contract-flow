import { recordContractAuditLog } from "@/lib/audit-log";
import {
  buildDocumentReadiness,
  extractComparableAttachmentText,
} from "@/lib/contract-attachment-text";
import { recordClauseDeviationUsage } from "@/lib/clause-usage-store";
import { detectClauseDeviations } from "@/lib/clause-deviation-detector";
import { loadMergedContractRecord } from "@/lib/contract-list-service";
import { saveContractRecord } from "@/lib/contract-persistence";
import { allowMemoryPersistence } from "@/lib/persistence-mode";
import { compareDocumentTexts } from "@/lib/legal-review-comparison";
import { persistLegalReviewRedlineDocument } from "@/lib/legal-review-redline-storage";
import { captureException } from "@/lib/error-reporting";
import type { ContractAttachment, ContractRecord } from "@/types/contract";
import type {
  CreateLegalReviewCommentInput,
  CreateLegalReviewRoundInput,
  LegalReviewComment,
  LegalReviewDeviation,
  LegalReviewRound,
  UpdateLegalReviewDeviationInput,
} from "@/types/legal-review";

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function loadContractForReview(
  contractId: string,
  organizationId: string,
): Promise<ContractRecord | null> {
  return loadMergedContractRecord(contractId, organizationId);
}

async function saveContractReviewState(contract: ContractRecord): Promise<void> {
  if (allowMemoryPersistence()) {
    const { replaceContractRecordInStore } = await import("@/lib/contract-store");
    replaceContractRecordInStore(contract);
    return;
  }

  await saveContractRecord(contract);
}

function parseLegalReviewRounds(value: unknown): LegalReviewRound[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value as LegalReviewRound[];
}

function findAttachment(
  contract: ContractRecord,
  attachmentId: string,
): ContractAttachment | undefined {
  return contract.attachments.find((item) => item.id === attachmentId);
}

function nextRoundNumber(rounds: LegalReviewRound[]): number {
  if (rounds.length === 0) {
    return 1;
  }

  return Math.max(...rounds.map((round) => round.roundNumber)) + 1;
}

function supersedeOpenRounds(rounds: LegalReviewRound[]): LegalReviewRound[] {
  return rounds.map((round) =>
    round.status === "open"
      ? {
          ...round,
          status: "superseded",
        }
      : round,
  );
}

export async function listLegalReviewRounds(
  contractId: string,
  organizationId: string,
): Promise<LegalReviewRound[]> {
  const contract = await loadContractForReview(contractId, organizationId);

  if (!contract) {
    return [];
  }

  return parseLegalReviewRounds(contract.legalReviewRounds).sort(
    (left, right) => right.roundNumber - left.roundNumber,
  );
}

export async function getLegalReviewRound(
  contractId: string,
  organizationId: string,
  roundId: string,
): Promise<LegalReviewRound | null> {
  const rounds = await listLegalReviewRounds(contractId, organizationId);

  return rounds.find((round) => round.id === roundId) ?? null;
}

async function persistRounds(
  contract: ContractRecord,
  organizationId: string,
  rounds: LegalReviewRound[],
  audit?: {
    actorName: string;
    actorEmail: string;
    action: string;
    detail: string;
  },
): Promise<LegalReviewRound[]> {
  const updated: ContractRecord = {
    ...contract,
    legalReviewRounds: rounds,
    updatedAt: new Date().toISOString(),
    auditTrail: audit
      ? [
          ...(contract.auditTrail ?? []),
          {
            id: createId("audit"),
            timestamp: new Date().toISOString(),
            actorName: audit.actorName,
            actorEmail: audit.actorEmail,
            action: audit.action,
            detail: audit.detail,
          },
        ]
      : contract.auditTrail,
  };

  await saveContractReviewState(updated);

  if (audit) {
    await recordContractAuditLog({
      organizationId,
      entityId: contract.id,
      action: audit.action,
      actorEmail: audit.actorEmail,
      actorName: audit.actorName,
      detail: audit.detail,
    });
  }

  return rounds;
}

export async function createLegalReviewRound(
  contractId: string,
  organizationId: string,
  input: CreateLegalReviewRoundInput,
  actor: { email: string; name: string },
): Promise<LegalReviewRound> {
  const contract = await loadContractForReview(contractId, organizationId);

  if (!contract) {
    throw new Error("Contract not found.");
  }

  const baseline = findAttachment(contract, input.baselineAttachmentId);
  const counterparty = findAttachment(contract, input.counterpartyAttachmentId);

  if (!baseline || !counterparty) {
    throw new Error("Select valid baseline and counterparty attachments.");
  }

  const existingRounds = parseLegalReviewRounds(contract.legalReviewRounds);
  const round: LegalReviewRound = {
    id: createId("review-round"),
    roundNumber: nextRoundNumber(existingRounds),
    status: "open",
    versionGroupId: counterparty.versionGroupId ?? baseline.versionGroupId ?? null,
    baselineAttachmentId: baseline.id,
    counterpartyAttachmentId: counterparty.id,
    baselineFileName: baseline.fileName,
    counterpartyFileName: counterparty.fileName,
    startedAt: new Date().toISOString(),
    completedAt: null,
    startedByName: actor.name,
    startedByEmail: actor.email,
    comparedAt: null,
    comparisonSummary: null,
    documentReadiness: [],
    deviations: [],
    comments: [],
  };

  const rounds = [round, ...supersedeOpenRounds(existingRounds)];

  await persistRounds(contract, organizationId, rounds, {
    actorName: actor.name,
    actorEmail: actor.email,
    action: "Legal review round started",
    detail: `Round ${round.roundNumber} compares ${baseline.fileName} with ${counterparty.fileName}.`,
  });

  return round;
}

function mergeExistingDeviationState(
  previous: LegalReviewDeviation[],
  next: LegalReviewDeviation[],
): LegalReviewDeviation[] {
  return next.map((deviation) => {
    const match = previous.find((item) => {
      if (deviation.clauseId && item.clauseId) {
        return item.clauseId === deviation.clauseId;
      }

      return (
        item.kind === deviation.kind &&
        item.baselineExcerpt === deviation.baselineExcerpt &&
        item.counterpartyExcerpt === deviation.counterpartyExcerpt
      );
    });

    if (!match) {
      return deviation;
    }

    return {
      ...deviation,
      id: match.id,
      status: match.status,
      priority: match.priority,
    };
  });
}

export async function compareLegalReviewRound(
  contractId: string,
  organizationId: string,
  roundId: string,
  actor: { email: string; name: string },
): Promise<LegalReviewRound> {
  const contract = await loadContractForReview(contractId, organizationId);

  if (!contract) {
    throw new Error("Contract not found.");
  }

  const rounds = parseLegalReviewRounds(contract.legalReviewRounds);
  const roundIndex = rounds.findIndex((item) => item.id === roundId);

  if (roundIndex === -1) {
    throw new Error("Legal review round not found.");
  }

  const round = rounds[roundIndex]!;
  const baseline = findAttachment(contract, round.baselineAttachmentId);
  const counterparty = findAttachment(contract, round.counterpartyAttachmentId);

  if (!baseline || !counterparty) {
    throw new Error("Round attachments are no longer available on this contract.");
  }

  const baselineReadiness = await buildDocumentReadiness(baseline);
  const counterpartyReadiness = await buildDocumentReadiness(counterparty);

  if (!baselineReadiness.readable || !counterpartyReadiness.readable) {
    const warnings = [baselineReadiness.warning, counterpartyReadiness.warning]
      .filter(Boolean)
      .join(" ");

    throw new Error(
      warnings ||
        "Both documents must be readable PDF or Word files before comparison.",
    );
  }

  const baselineExtraction = await extractComparableAttachmentText(baseline);
  const counterpartyExtraction = await extractComparableAttachmentText(
    counterparty,
  );
  const comparison = compareDocumentTexts({
    baselineText: baselineExtraction.text,
    counterpartyText: counterpartyExtraction.text,
  });
  const clauseDeviations = await detectClauseDeviations({
    organizationId,
    contractType: contract.contractType,
    counterpartyText: counterpartyExtraction.text,
  });

  if (!round.comparedAt) {
    for (const deviation of clauseDeviations) {
      if (deviation.clauseId && deviation.counterpartyExcerpt) {
        await recordClauseDeviationUsage({
          organizationId,
          contractId,
          clauseId: deviation.clauseId,
          usedText: deviation.counterpartyExcerpt,
        });
      }
    }
  }

  const deviations = mergeExistingDeviationState(round.deviations, [
    ...clauseDeviations,
    ...comparison.deviations,
  ]);
  let redlineDocument = round.redlineDocument ?? null;
  let comparisonSummary = comparison.summary;

  try {
    redlineDocument = await persistLegalReviewRedlineDocument({
      organizationId,
      contractId,
      roundId: round.id,
      roundNumber: round.roundNumber,
      baselineFileName: round.baselineFileName,
      counterpartyFileName: round.counterpartyFileName,
      baselineText: baselineExtraction.text,
      counterpartyText: counterpartyExtraction.text,
      comparisonSummary: comparison.summary,
      generatedByName: actor.name,
    });
  } catch (error) {
    captureException(error, {
      scope: "compareLegalReviewRound.redline",
      contractId,
      roundId: round.id,
    });
    comparisonSummary = `${comparison.summary} Redline document could not be generated.`;
  }

  const updatedRound: LegalReviewRound = {
    ...round,
    comparedAt: new Date().toISOString(),
    comparisonSummary,
    documentReadiness: [baselineReadiness, counterpartyReadiness],
    redlineDocument,
    deviations,
  };

  rounds[roundIndex] = updatedRound;

  await persistRounds(
    { ...contract, legalReviewRounds: rounds },
    organizationId,
    rounds,
    {
      actorName: actor.name,
      actorEmail: actor.email,
      action: "Legal review comparison completed",
      detail: redlineDocument
        ? `Round ${round.roundNumber} identified ${deviations.length} deviation${deviations.length === 1 ? "" : "s"} and generated a downloadable redline document.`
        : `Round ${round.roundNumber} identified ${deviations.length} deviation${deviations.length === 1 ? "" : "s"}. Redline document generation failed.`,
    },
  );

  return updatedRound;
}

export async function updateLegalReviewDeviation(
  contractId: string,
  organizationId: string,
  roundId: string,
  deviationId: string,
  input: UpdateLegalReviewDeviationInput,
): Promise<LegalReviewDeviation> {
  const contract = await loadContractForReview(contractId, organizationId);

  if (!contract) {
    throw new Error("Contract not found.");
  }

  const rounds = parseLegalReviewRounds(contract.legalReviewRounds);
  const roundIndex = rounds.findIndex((item) => item.id === roundId);

  if (roundIndex === -1) {
    throw new Error("Legal review round not found.");
  }

  const round = rounds[roundIndex]!;
  const deviationIndex = round.deviations.findIndex(
    (item) => item.id === deviationId,
  );

  if (deviationIndex === -1) {
    throw new Error("Deviation not found.");
  }

  const updatedDeviation: LegalReviewDeviation = {
    ...round.deviations[deviationIndex]!,
    ...input,
  };

  round.deviations[deviationIndex] = updatedDeviation;
  rounds[roundIndex] = round;

  await persistRounds({ ...contract, legalReviewRounds: rounds }, organizationId, rounds);

  return updatedDeviation;
}

export async function addLegalReviewComment(
  contractId: string,
  organizationId: string,
  roundId: string,
  input: CreateLegalReviewCommentInput,
  actor: { email: string; name: string },
): Promise<LegalReviewComment> {
  const contract = await loadContractForReview(contractId, organizationId);

  if (!contract) {
    throw new Error("Contract not found.");
  }

  const rounds = parseLegalReviewRounds(contract.legalReviewRounds);
  const roundIndex = rounds.findIndex((item) => item.id === roundId);

  if (roundIndex === -1) {
    throw new Error("Legal review round not found.");
  }

  const comment: LegalReviewComment = {
    id: createId("review-comment"),
    roundId,
    deviationId: input.deviationId ?? null,
    parentCommentId: input.parentCommentId ?? null,
    body: input.body.trim(),
    authorName: actor.name,
    authorEmail: actor.email,
    createdAt: new Date().toISOString(),
  };

  if (!comment.body) {
    throw new Error("Comment body is required.");
  }

  const round = rounds[roundIndex]!;
  round.comments = [...round.comments, comment];
  rounds[roundIndex] = round;

  await persistRounds({ ...contract, legalReviewRounds: rounds }, organizationId, rounds);

  return comment;
}

export async function completeLegalReviewRound(
  contractId: string,
  organizationId: string,
  roundId: string,
  actor: { email: string; name: string },
): Promise<LegalReviewRound> {
  const contract = await loadContractForReview(contractId, organizationId);

  if (!contract) {
    throw new Error("Contract not found.");
  }

  const rounds = parseLegalReviewRounds(contract.legalReviewRounds);
  const roundIndex = rounds.findIndex((item) => item.id === roundId);

  if (roundIndex === -1) {
    throw new Error("Legal review round not found.");
  }

  const round = rounds[roundIndex]!;
  const updatedRound: LegalReviewRound = {
    ...round,
    status: "completed",
    completedAt: new Date().toISOString(),
  };

  rounds[roundIndex] = updatedRound;

  await persistRounds(
    { ...contract, legalReviewRounds: rounds },
    organizationId,
    rounds,
    {
      actorName: actor.name,
      actorEmail: actor.email,
      action: "Legal review round completed",
      detail: `Round ${round.roundNumber} marked complete with ${round.deviations.length} tracked deviation${round.deviations.length === 1 ? "" : "s"}.`,
    },
  );

  return updatedRound;
}

export async function maybeStartLegalReviewRoundForAttachmentUpload(options: {
  contractId: string;
  organizationId: string;
  attachment: ContractAttachment;
  priorCurrentAttachment?: ContractAttachment;
  actor: { email: string; name: string };
}): Promise<LegalReviewRound | null> {
  if (
    options.attachment.documentType !== "third_party_document" ||
    !options.priorCurrentAttachment
  ) {
    return null;
  }

  const round = await createLegalReviewRound(
    options.contractId,
    options.organizationId,
    {
      baselineAttachmentId: options.priorCurrentAttachment.id,
      counterpartyAttachmentId: options.attachment.id,
    },
    options.actor,
  );

  try {
    return await compareLegalReviewRound(
      options.contractId,
      options.organizationId,
      round.id,
      options.actor,
    );
  } catch {
    return round;
  }
}
