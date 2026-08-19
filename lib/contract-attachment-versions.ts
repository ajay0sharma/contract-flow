import type { ContractAttachment, IntakeDocumentType } from "@/types/contract";

export interface AttachmentVersionGroup {
  versionGroupId: string;
  documentType: IntakeDocumentType;
  current: NormalizedContractAttachment;
  priorVersions: NormalizedContractAttachment[];
  allVersions: NormalizedContractAttachment[];
}

export type NormalizedContractAttachment = ContractAttachment & {
  versionGroupId: string;
  versionNumber: number;
  isCurrent: boolean;
};

export function normalizeAttachmentVersionFields(
  attachment: ContractAttachment,
): NormalizedContractAttachment {
  const versionGroupId = attachment.versionGroupId?.trim() || attachment.id;
  const versionNumber =
    typeof attachment.versionNumber === "number" && attachment.versionNumber > 0
      ? attachment.versionNumber
      : 1;
  const isCurrent =
    typeof attachment.isCurrent === "boolean" ? attachment.isCurrent : true;

  return {
    ...attachment,
    versionGroupId,
    versionNumber,
    isCurrent,
  };
}

export function normalizeContractAttachments(
  attachments: ContractAttachment[] | undefined,
): NormalizedContractAttachment[] {
  const normalized = (attachments ?? []).map(normalizeAttachmentVersionFields);
  const byGroup = new Map<string, NormalizedContractAttachment[]>();

  for (const attachment of normalized) {
    const existing = byGroup.get(attachment.versionGroupId) ?? [];
    existing.push(attachment);
    byGroup.set(attachment.versionGroupId, existing);
  }

  const coalesced: NormalizedContractAttachment[] = [];

  for (const versions of byGroup.values()) {
    const currentVersions = versions.filter((attachment) => attachment.isCurrent);

    if (currentVersions.length <= 1) {
      coalesced.push(...versions);
      continue;
    }

    const current = currentVersions.reduce((latest, attachment) =>
      attachment.versionNumber > latest.versionNumber ? attachment : latest,
    );

    coalesced.push(
      ...versions.map((attachment) => ({
        ...attachment,
        isCurrent: attachment.id === current.id,
      })),
    );
  }

  return coalesced;
}

export function groupAttachmentsByVersion(
  attachments: ContractAttachment[] | undefined,
): AttachmentVersionGroup[] {
  const normalized = normalizeContractAttachments(attachments);
  const groups = new Map<string, NormalizedContractAttachment[]>();

  for (const attachment of normalized) {
    const existing = groups.get(attachment.versionGroupId) ?? [];
    existing.push(attachment);
    groups.set(attachment.versionGroupId, existing);
  }

  return Array.from(groups.entries())
    .map(([versionGroupId, versions]) => {
      const sorted = [...versions].sort(
        (left, right) => right.versionNumber - left.versionNumber,
      );
      const current =
        sorted.find((version) => version.isCurrent) ?? sorted[0] ?? versions[0];
      const priorVersions = sorted.filter((version) => version.id !== current.id);

      return {
        versionGroupId,
        documentType: current.documentType,
        current,
        priorVersions,
        allVersions: sorted,
      };
    })
    .sort(
      (left, right) =>
        new Date(right.current.uploadedAt).getTime() -
        new Date(left.current.uploadedAt).getTime(),
    );
}

export function prepareAttachmentUpload(
  existingAttachments: ContractAttachment[] | undefined,
  documentType: IntakeDocumentType,
): {
  updatedAttachments: ContractAttachment[];
  versionGroupId: string;
  versionNumber: number;
  replacesPriorVersion: boolean;
} {
  const normalized = normalizeContractAttachments(existingAttachments);
  const currentOfType = normalized.filter(
    (attachment) =>
      attachment.documentType === documentType && attachment.isCurrent,
  );

  if (currentOfType.length === 1) {
    const { versionGroupId } = currentOfType[0];
    const maxVersion = Math.max(
      ...normalized
        .filter((attachment) => attachment.versionGroupId === versionGroupId)
        .map((attachment) => attachment.versionNumber),
      1,
    );

    return {
      updatedAttachments: normalized.map((attachment) =>
        attachment.versionGroupId === versionGroupId && attachment.isCurrent
          ? { ...attachment, isCurrent: false }
          : attachment,
      ),
      versionGroupId,
      versionNumber: maxVersion + 1,
      replacesPriorVersion: true,
    };
  }

  const versionGroupId = `vgrp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    updatedAttachments: normalized,
    versionGroupId,
    versionNumber: 1,
    replacesPriorVersion: false,
  };
}

export function createIntakeAttachmentVersionFields(index: number): {
  versionGroupId: string;
  versionNumber: number;
  isCurrent: true;
} {
  return {
    versionGroupId: `vgrp-${Date.now()}-${index}`,
    versionNumber: 1,
    isCurrent: true,
  };
}
