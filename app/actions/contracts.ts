"use server";

import { currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addContractAttachment,
  addContractEmail,
  approveContract,
  assignContractLegalReviewer,
  canViewContractRecord,
  getContractById,
  getContractByRecordLookup,
  markContractActive,
  rejectContract,
  setContractConfidentiality,
  submitContractIntake,
  updateContractRecordDetails,
} from "@/lib/contract-store";
import { assignLegalReviewerAndPersist } from "@/lib/contract-persistence";
import { resolveClauseLibraryOrganizationId } from "@/lib/clause-library-org";
import { isDatabaseConfigured } from "@/lib/prisma";
import { createCounterparty } from "@/lib/counterparty-store";
import { getUserDisplayName } from "@/lib/user-display-name";
import type {
  AddContractEmailInput,
  ContractIntakeAttachmentInput,
  ContractIntakeInput,
  ContractRecordUpdateInput,
} from "@/types/contract";
import {
  CONTRACT_EMAIL_SOURCES,
  MAX_EML_FILE_BYTES,
} from "@/lib/email-sources";
import {
  INTAKE_DOCUMENT_TYPES,
  MAX_INTAKE_ATTACHMENT_BYTES,
} from "@/lib/intake-documents";
import {
  canManageContractDocuments,
  getLegalAssignableUsers,
  isLegalEmail,
  isSupportEmail,
} from "@/lib/access-control";
import { getWorkflowConfig } from "@/lib/workflow-store";
import {
  getContractTemplateById,
  validateIntakeTemplateReference,
} from "@/lib/contract-template-store";
import { recordContractAuditLog } from "@/lib/audit-log";

import { isPopulated, safeTrim } from "@/lib/string-utils";

async function getActor() {
  const user = await currentUser();

  if (!user) {
    throw new Error("You must be signed in.");
  }

  return {
    email: user.primaryEmailAddress?.emailAddress ?? "",
    name: getUserDisplayName(user),
  };
}

function requireCanViewContract(contractId: string, actorEmail: string) {
  const contract = getContractById(contractId);

  if (!contract) {
    throw new Error("Contract not found.");
  }

  if (!canViewContractRecord(contract, actorEmail)) {
    throw new Error("You do not have access to this contract record.");
  }

  return contract;
}

export async function submitIntakeAction(
  input: Omit<ContractIntakeInput, "requesterName" | "requesterEmail"> & {
    saveNewCounterparty?: boolean;
  },
) {
  const actor = await getActor();

  if (isPopulated(input.contractAmount) && input.budgeted === undefined) {
    throw new Error("Select whether this contract is budgeted (Yes or No).");
  }

  const workflowConfig = getWorkflowConfig();
  const isChildAgreement =
    workflowConfig.agreementTypeRules.childAgreementTypes.includes(
      input.contractType,
    );

  if (isChildAgreement && !input.parentAgreementId) {
    throw new Error("Select the active parent agreement for this child agreement.");
  }

  let parentAgreementId: string | undefined;

  if (input.parentAgreementId) {
    const parentAgreement = getContractByRecordLookup(input.parentAgreementId);

    if (!parentAgreement) {
      throw new Error("Parent agreement contract record ID was not found.");
    }

    if (parentAgreement.stage !== "active") {
      throw new Error("Selected parent agreement must be active.");
    }

    if (
      !workflowConfig.agreementTypeRules.parentAgreementTypes.includes(
        parentAgreement.contractType,
      )
    ) {
      throw new Error(
        "Selected parent agreement type is not configured as a parent agreement.",
      );
    }

    parentAgreementId = parentAgreement.id;
  }

  if (input.attachments?.length) {
    for (const attachment of input.attachments) {
      if (!INTAKE_DOCUMENT_TYPES.includes(attachment.documentType)) {
        throw new Error("Select a valid document type for each attachment.");
      }

      if (attachment.sizeBytes > MAX_INTAKE_ATTACHMENT_BYTES) {
        throw new Error(
          `Attached document "${attachment.fileName}" must be 10 MB or smaller.`,
        );
      }
    }
  }

  if (
    !safeTrim(input.companyName) ||
    !safeTrim(input.mainContactName) ||
    !safeTrim(input.mainContactEmail) ||
    !safeTrim(input.address)
  ) {
    throw new Error(
      "Counterparty name, main contact name, main contact email, and address are required.",
    );
  }

  let counterpartyId = input.counterpartyId;

  if (input.saveNewCounterparty) {
    const profile = createCounterparty({
      name: input.companyName,
      mainContactName: input.mainContactName,
      mainContactTitle: input.mainContactTitle,
      mainContactEmail: input.mainContactEmail,
      mainContactPhone: input.mainContactPhone,
      address: input.address,
    });
    counterpartyId = profile.id;
  }

  let templateId: string | undefined;
  let templateVersion: number | undefined;

  if (input.templateId) {
    const validated = await validateIntakeTemplateReference(
      input.templateId,
      input.templateVersion,
      input.companyProfileId,
    );

    if (!validated) {
      throw new Error(
        "The selected contract template is invalid or no longer available.",
      );
    }

    templateId = validated.templateId;
    templateVersion = validated.templateVersion;
  } else if (input.templateVersion !== undefined) {
    throw new Error("Template version cannot be provided without a template.");
  }

  const contract = submitContractIntake({
    ...input,
    parentAgreementId,
    templateId,
    templateVersion,
    contractAmount: safeTrim(input.contractAmount),
    companyName: safeTrim(input.companyName),
    address: safeTrim(input.address),
    mainContactName: safeTrim(input.mainContactName),
    mainContactEmail: safeTrim(input.mainContactEmail),
    counterpartyId,
    requesterName: actor.name,
    requesterEmail: actor.email,
  });

  if (templateId && templateVersion) {
    const template = await getContractTemplateById(
      templateId,
      input.companyProfileId,
    );

    await recordContractAuditLog({
      organizationId: input.companyProfileId,
      entityId: contract.id,
      action: "contract_draft_generated",
      detail: template
        ? `Submitted contract ${contract.recordNumber} generated from template "${template.title}" (v${templateVersion}).`
        : `Submitted contract ${contract.recordNumber} generated from template v${templateVersion}.`,
      actorEmail: actor.email,
      actorName: actor.name,
      metadata: {
        templateId,
        templateVersion,
        contractRecordNumber: contract.recordNumber,
      },
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/contracts/new");
  redirect(`/contracts/${contract.id}`);
}

export async function createCounterpartyForIntakeAction(input: {
  companyName: string;
  mainContactName: string;
  mainContactTitle?: string;
  mainContactEmail: string;
  mainContactPhone?: string;
  address: string;
}): Promise<string> {
  await getActor();

  const profile = createCounterparty({
    name: safeTrim(input.companyName),
    mainContactName: safeTrim(input.mainContactName),
    mainContactTitle: safeTrim(input.mainContactTitle),
    mainContactEmail: safeTrim(input.mainContactEmail),
    mainContactPhone: safeTrim(input.mainContactPhone),
    address: safeTrim(input.address),
  });

  return profile.id;
}

export async function approveContractAction(
  contractId: string,
  note: string,
) {
  const actor = await getActor();
  requireCanViewContract(contractId, actor.email);

  if (isSupportEmail(actor.email)) {
    throw new Error("Support users cannot approve contracts.");
  }

  approveContract(contractId, actor.email, actor.name, note || undefined);

  revalidatePath("/dashboard");
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath(`/contracts/${contractId}/review`);
  redirect(`/contracts/${contractId}`);
}

export async function assignLegalReviewerAction(
  contractId: string,
  assigneeEmail: string,
) {
  const actor = await getActor();

  if (!isLegalEmail(actor.email)) {
    throw new Error("Only legal users can assign contract records.");
  }

  const assignee = getLegalAssignableUsers().find(
    (user) =>
      user.email.toLowerCase() === safeTrim(assigneeEmail).toLowerCase(),
  );

  if (!assignee) {
    throw new Error("Select a user with legal permissions.");
  }

  if (isDatabaseConfigured()) {
    await assignLegalReviewerAndPersist(
      contractId,
      resolveClauseLibraryOrganizationId(),
      assignee,
      actor,
    );
  } else {
    assignContractLegalReviewer(contractId, assignee, actor);
  }

  revalidatePath("/legal/dashboard");
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath(`/contracts/${contractId}/review`);
}

export async function pickupLegalReviewerAction(contractId: string) {
  const actor = await getActor();

  if (!isLegalEmail(actor.email)) {
    throw new Error("Only legal users can pick up contract records.");
  }

  const assignee = getLegalAssignableUsers().find(
    (user) => user.email.toLowerCase() === actor.email.toLowerCase(),
  );

  if (!assignee) {
    throw new Error("Your account is not configured as a legal reviewer.");
  }

  await assignLegalReviewerAction(contractId, assignee.email);
}

export async function updateContractRecordAction(
  contractId: string,
  input: ContractRecordUpdateInput,
) {
  const actor = await getActor();

  if (!isLegalEmail(actor.email)) {
    throw new Error("Only legal users can edit contract records.");
  }

  updateContractRecordDetails(contractId, input, actor);

  revalidatePath("/dashboard");
  revalidatePath("/legal/dashboard");
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath(`/contracts/${contractId}/review`);
}

export async function setContractConfidentialAction(
  contractId: string,
  confidential: boolean,
) {
  const actor = await getActor();

  if (!isLegalEmail(actor.email)) {
    throw new Error("Only legal users can update confidentiality.");
  }

  setContractConfidentiality(contractId, confidential, actor);

  revalidatePath("/dashboard");
  revalidatePath("/legal/dashboard");
  revalidatePath("/legal/reports");
  revalidatePath("/admin/dashboard");
  revalidatePath("/search");
  revalidatePath(`/contracts/${contractId}`);
}

export async function rejectContractAction(
  contractId: string,
  note: string,
) {
  const actor = await getActor();
  requireCanViewContract(contractId, actor.email);

  if (isSupportEmail(actor.email)) {
    throw new Error("Support users cannot reject contracts.");
  }

  rejectContract(contractId, actor.email, actor.name, note || undefined);

  revalidatePath("/dashboard");
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath(`/contracts/${contractId}/review`);
  redirect(`/contracts/${contractId}`);
}

export async function activateContractAction(contractId: string) {
  const actor = await getActor();

  if (isSupportEmail(actor.email)) {
    throw new Error("Support users cannot activate contracts.");
  }

  markContractActive(contractId, actor.name, actor.email);

  revalidatePath("/dashboard");
  revalidatePath(`/contracts/${contractId}`);
}

export async function addContractAttachmentAction(
  contractId: string,
  input: ContractIntakeAttachmentInput,
) {
  const actor = await getActor();
  requireCanViewContract(contractId, actor.email);

  if (!canManageContractDocuments(actor.email)) {
    throw new Error("You do not have permission to upload contract documents.");
  }

  if (!INTAKE_DOCUMENT_TYPES.includes(input.documentType)) {
    throw new Error("Select a valid document type.");
  }

  if (input.sizeBytes > MAX_INTAKE_ATTACHMENT_BYTES) {
    throw new Error("Attached documents must be 10 MB or smaller.");
  }

  addContractAttachment(contractId, input, actor);

  revalidatePath("/dashboard");
  revalidatePath("/legal/dashboard");
  revalidatePath("/admin/dashboard");
  revalidatePath("/search");
  revalidatePath(`/contracts/${contractId}`);
}

export async function addContractEmailAction(
  contractId: string,
  input: AddContractEmailInput,
) {
  const actor = await getActor();
  requireCanViewContract(contractId, actor.email);

  if (isSupportEmail(actor.email)) {
    throw new Error("Support users can upload documents but cannot add related emails.");
  }

  if (!input.subject.trim() || !input.from.trim() || !input.to.trim()) {
    throw new Error("Subject, from, and to are required for related emails.");
  }

  if (!CONTRACT_EMAIL_SOURCES.includes(input.source)) {
    throw new Error("Select a valid email source.");
  }

  if (input.emlDataBase64 && input.emlFileName) {
    const approximateBytes = Math.ceil((input.emlDataBase64.length * 3) / 4);

    if (approximateBytes > MAX_EML_FILE_BYTES) {
      throw new Error("Email export files must be 5 MB or smaller.");
    }
  }

  addContractEmail(contractId, input, actor.name, actor.email);

  revalidatePath(`/contracts/${contractId}`);
  revalidatePath(`/contracts/${contractId}/review`);
}
