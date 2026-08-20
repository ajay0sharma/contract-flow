export type LegalReviewRoundStatus = "open" | "completed" | "superseded";

export type LegalReviewDeviationKind =
  | "modified"
  | "added"
  | "removed"
  | "clause_deviation";

export type LegalReviewDeviationPriority =
  | "critical"
  | "high"
  | "medium"
  | "low";

export type LegalReviewDeviationStatus =
  | "open"
  | "accepted"
  | "rejected"
  | "resolved";

export interface LegalReviewDocumentReadiness {
  attachmentId: string;
  fileName: string;
  readable: boolean;
  characterCount: number;
  warning: string | null;
}

export interface LegalReviewDeviation {
  id: string;
  kind: LegalReviewDeviationKind;
  title: string;
  summary: string;
  priority: LegalReviewDeviationPriority;
  status: LegalReviewDeviationStatus;
  baselineExcerpt: string | null;
  counterpartyExcerpt: string | null;
  clauseId: string | null;
  clauseTitle: string | null;
  approvedClauseText: string | null;
  createdAt: string;
}

export interface LegalReviewComment {
  id: string;
  roundId: string;
  deviationId: string | null;
  parentCommentId: string | null;
  body: string;
  authorName: string;
  authorEmail: string;
  createdAt: string;
}

export interface LegalReviewRedlineDocument {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath?: string;
  dataBase64?: string;
  generatedAt: string;
}

export interface LegalReviewRound {
  id: string;
  roundNumber: number;
  status: LegalReviewRoundStatus;
  versionGroupId: string | null;
  baselineAttachmentId: string;
  counterpartyAttachmentId: string;
  baselineFileName: string;
  counterpartyFileName: string;
  startedAt: string;
  completedAt: string | null;
  startedByName: string;
  startedByEmail: string;
  comparedAt: string | null;
  comparisonSummary: string | null;
  redlineDocument?: LegalReviewRedlineDocument | null;
  documentReadiness: LegalReviewDocumentReadiness[];
  deviations: LegalReviewDeviation[];
  comments: LegalReviewComment[];
}

export interface CreateLegalReviewRoundInput {
  baselineAttachmentId: string;
  counterpartyAttachmentId: string;
}

export interface UpdateLegalReviewDeviationInput {
  status?: LegalReviewDeviationStatus;
  priority?: LegalReviewDeviationPriority;
}

export interface CreateLegalReviewCommentInput {
  body: string;
  deviationId?: string | null;
  parentCommentId?: string | null;
}
