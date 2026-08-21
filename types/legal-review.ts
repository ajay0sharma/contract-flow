export type LegalReviewRoundStatus = "open" | "completed" | "superseded";

export type LegalReviewDeviationKind =
  | "modified"
  | "added"
  | "removed"
  | "moved"
  | "formatting_change"
  | "table_change"
  | "image_change"
  | "footnote_change"
  | "clause_deviation";

export interface LegalReviewChangeStatistics {
  total: number;
  modified: number;
  added: number;
  removed: number;
  moved: number;
  formatting: number;
  tables: number;
  images: number;
  footnotes: number;
  clauseDeviations: number;
  priority: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export interface LegalReviewReviewStatistics {
  open: number;
  accepted: number;
  rejected: number;
  resolved: number;
  reviewed: number;
  total: number;
  percentComplete: number;
}

export type LegalReviewAlignmentBlock =
  | { kind: "unchanged"; text: string }
  | { kind: "removed"; text: string; movedTo?: string }
  | { kind: "added"; text: string; movedFrom?: string }
  | { kind: "modified"; baselineText: string; counterpartyText: string }
  | { kind: "moved"; baselineText: string; counterpartyText: string };

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
  documentAlignment?: LegalReviewAlignmentBlock[] | null;
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

export interface BulkUpdateLegalReviewDeviationsInput {
  deviationIds?: string[];
  status: LegalReviewDeviationStatus;
}

export interface CreateLegalReviewCommentInput {
  body: string;
  deviationId?: string | null;
  parentCommentId?: string | null;
}
