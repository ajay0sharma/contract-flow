"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useDeferredEffect } from "@/lib/use-deferred-effect";
import { createCounterpartyForIntakeAction } from "@/app/actions/contracts";
import { recordContractDraftGeneratedAction } from "@/app/actions/template-audit";
import {
  FormField,
  inputClassName,
  readOnlyInputClassName,
  selectClassName,
  textareaClassName,
} from "@/components/ui/FormField";
import {
  getAvailableCompanyConfigs,
  getCompanyConfig,
} from "@/lib/company-config";
import type { CounterpartyProfile } from "@/lib/counterparty-store";
import type { AgreementTypeRules } from "@/lib/workflow-config-types";
import { ParentAgreementSearchField } from "@/components/contracts/ParentAgreementSearchField";
import {
  ContractIntakeStepProgress,
  INTAKE_FORM_STEP_COUNT,
} from "@/components/contracts/ContractIntakeStepProgress";
import { ContractTemplatePicker } from "@/components/contracts/ContractTemplatePicker";
import { ContractTypeCardPicker } from "@/components/contracts/ContractTypeCardPicker";
import {
  NoTemplateSummaryCard,
  SelectedContractTypeCard,
  SelectedTemplateSummaryCard,
} from "@/components/contracts/IntakeSelectionSummary";
import { TemplateVariableForm } from "@/components/contracts/TemplateVariableForm";
import { CustomIntakeSections } from "@/components/contracts/CustomIntakeSections";
import { PeoplePicker } from "@/components/shared/PeoplePicker";
import { createIntakeFormLayoutHelpers } from "@/lib/intake-form-layout";
import {
  buildVariableValuesFromIntakeForm,
  resolveCompanyContractType,
  validateTemplateVariableValues,
  type IntakeFormVariableContext,
} from "@/lib/contract-template-intake";
import {
  buildGeneratedContractSummary,
  findDefaultTemplateForType,
} from "@/lib/contract-template-utils";
import type {
  ContractTemplateRecord,
  ContractTemplateType,
  ContractTypeRecord,
} from "@/types/contract-template";
import {
  INTAKE_DOCUMENT_TYPE_LABELS,
  INTAKE_DOCUMENT_TYPES,
  MAX_INTAKE_ATTACHMENT_BYTES,
  type IntakeDocumentType,
} from "@/lib/intake-documents";
import { isPopulated } from "@/lib/string-utils";
import type { ContractIntakeInput, ContractRecord } from "@/types/contract";
import type { IntakeFormDefinitionRecord } from "@/types/intake-form";
import type { IntakePoConfig, PoLookupResult } from "@/types/po-integration";
import { mapPoResultToFormFields } from "@/types/po-integration";

type PoAutoFillField =
  | "department"
  | "companyName"
  | "contractAmount"
  | "contractDescription";

type PoLookupStatus = "idle" | "loading" | "found" | "not_found" | "error";

function PlugIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22v-5" />
      <path d="M9 8V2h6v6" />
      <path d="M5 12H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1" />
      <path d="M19 12h1a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-1" />
    </svg>
  );
}

function PoSpinner() {
  return (
    <svg
      aria-hidden
      className="h-4 w-4 animate-spin text-blue-600"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

const initialFormState = {
  department: "",
  contractType: "",
  contractStartDate: "",
  contractEndDate: "",
  contractTitle: "",
  contractDescription: "",
  contractAmount: "",
  poNumber: "",
  parentAgreementId: "",
  otherNotes: "",
  companyName: "",
  address: "",
  mainContactName: "",
  mainContactTitle: "",
  mainContactEmail: "",
  mainContactPhone: "",
};

interface PendingAttachment {
  id: string;
  documentType: IntakeDocumentType | "";
  file: File | null;
}

interface ContractIntakeFormProps {
  requesterName: string;
  counterparties: CounterpartyProfile[];
  agreementTypeRules: AgreementTypeRules;
  parentAgreementOptions: ContractRecord[];
  contractTemplates: ContractTemplateRecord[];
  intakeContractTypes: ContractTypeRecord[];
  intakeFormLayout: IntakeFormDefinitionRecord | null;
}

type IntakePath = "pick-template" | "form";

const NEW_COUNTERPARTY_VALUE = "__new__";

function resolveIntakeStepIndex(
  intakePath: IntakePath,
  selectedTemplateType: ContractTemplateType | "",
  selectedTemplate: ContractTemplateRecord | null,
  selectedTemplateId: string | null,
  showTemplatePicker: boolean,
): number {
  if (intakePath === "pick-template") {
    if (!selectedTemplateType) {
      return 1;
    }

    return showTemplatePicker ? 2 : 1;
  }

  if (selectedTemplate && !selectedTemplateId) {
    return 6;
  }

  if (selectedTemplateId) {
    return 8;
  }

  return 3;
}

function isAmountPopulated(amount: string | undefined | null): boolean {
  return isPopulated(amount);
}

function toVariableContext(
  form: typeof initialFormState,
): IntakeFormVariableContext {
  return {
    companyName: form.companyName,
    address: form.address,
    mainContactName: form.mainContactName,
    mainContactTitle: form.mainContactTitle,
    mainContactEmail: form.mainContactEmail,
    mainContactPhone: form.mainContactPhone,
    contractStartDate: form.contractStartDate,
    contractEndDate: form.contractEndDate,
    contractAmount: form.contractAmount,
    contractTitle: form.contractTitle,
    poNumber: form.poNumber,
  };
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Unable to read the selected file."));
        return;
      }

      const base64 = reader.result.split(",")[1];

      if (!base64) {
        reject(new Error("Unable to read the selected file."));
        return;
      }

      resolve(base64);
    };

    reader.onerror = () => {
      reject(new Error("Unable to read the selected file."));
    };

    reader.readAsDataURL(file);
  });
}

export function ContractIntakeForm({
  requesterName,
  counterparties,
  agreementTypeRules,
  parentAgreementOptions,
  contractTemplates,
  intakeContractTypes,
  intakeFormLayout,
}: ContractIntakeFormProps) {
  const router = useRouter();
  const formId = useId();
  const intakeLayout = useMemo(
    () => createIntakeFormLayoutHelpers(intakeFormLayout),
    [intakeFormLayout],
  );
  const contractTypeSectionRef = useRef<HTMLElement>(null);
  const nextAttachmentIdRef = useRef(1);
  const [intakePath, setIntakePath] = useState<IntakePath>("pick-template");
  const [selectedTemplate, setSelectedTemplate] =
    useState<ContractTemplateRecord | null>(null);
  const [templateVariableValues, setTemplateVariableValues] = useState<
    Record<string, string>
  >({});
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  );
  const [selectedTemplateVersion, setSelectedTemplateVersion] = useState<
    number | null
  >(null);
  const [variableFormError, setVariableFormError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState("default");
  const [counterpartySelection, setCounterpartySelection] = useState("");
  const [form, setForm] = useState(initialFormState);
  const [customFieldValues, setCustomFieldValues] = useState<
    Record<string, string>
  >({});
  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >(() => [
    {
      id: `${formId}-attachment-0`,
      documentType: "",
      file: null,
    },
  ]);
  const [budgeted, setBudgeted] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingContractTypeChange, setPendingContractTypeChange] = useState<
    ContractTemplateType | null
  >(null);
  const [selectedTemplateType, setSelectedTemplateType] = useState<
    ContractTemplateType | ""
  >("");
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [contractTypeConfirmed, setContractTypeConfirmed] = useState(false);
  const [poConfig, setPoConfig] = useState<IntakePoConfig | null>(null);
  const [poLookupStatus, setPoLookupStatus] = useState<PoLookupStatus>("idle");
  const [poLookupResult, setPoLookupResult] = useState<PoLookupResult | null>(
    null,
  );
  const [poDetailsExpanded, setPoDetailsExpanded] = useState(false);
  const [poAutoFilledFields, setPoAutoFilledFields] = useState<
    Set<PoAutoFillField>
  >(new Set());
  const poAutoFilledSnapshotRef = useRef<
    Partial<Record<PoAutoFillField, string>>
  >({});
  const lastLookedUpPoRef = useRef("");
  const [isPending, startTransition] = useTransition();

  function createPendingAttachment(): PendingAttachment {
    const attachmentId = nextAttachmentIdRef.current;
    nextAttachmentIdRef.current += 1;

    return {
      id: `${formId}-attachment-${attachmentId}`,
      documentType: "",
      file: null,
    };
  }

  const companyConfig = useMemo(
    () => getCompanyConfig(companyId),
    [companyId],
  );

  const companyTemplates = useMemo(
    () =>
      contractTemplates.filter(
        (template) => template.organizationId === companyId,
      ),
    [contractTemplates, companyId],
  );

  const poIntegrationEnabled = Boolean(poConfig?.configured && poConfig.isEnabled);
  const poDisplayName = poConfig?.displayName ?? "PO system";

  const poRequiredForType = useMemo(() => {
    if (!poConfig?.requirePoNumber || !poConfig.isEnabled) {
      return false;
    }

    if (!selectedTemplateType) {
      return false;
    }

    const allowed = poConfig.allowedContractTypes;

    if (allowed === null || allowed === undefined) {
      return true;
    }

    return Array.isArray(allowed) && allowed.includes(selectedTemplateType);
  }, [poConfig, selectedTemplateType]);

  const showPoNumberField =
    isAmountPopulated(form.contractAmount) ||
    poRequiredForType ||
    poIntegrationEnabled;

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/po/config")
      .then(async (response) => {
        if (!response.ok) {
          return { configured: false } satisfies IntakePoConfig;
        }

        return (await response.json()) as IntakePoConfig;
      })
      .then((config) => {
        if (!cancelled) {
          setPoConfig(config);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPoConfig({ configured: false });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function renderPoAutoFillBadge(field: PoAutoFillField) {
    if (!poIntegrationEnabled || !poAutoFilledFields.has(field)) {
      return null;
    }

    return (
      <p className="mt-1 text-xs text-blue-600">
        Auto-filled from {poDisplayName}
      </p>
    );
  }

  function clearPoBadgeIfEdited(field: PoAutoFillField, value: string): void {
    if (
      poAutoFilledSnapshotRef.current[field] !== undefined &&
      value !== poAutoFilledSnapshotRef.current[field]
    ) {
      setPoAutoFilledFields((current) => {
        const next = new Set(current);
        next.delete(field);
        return next;
      });
    }
  }

  function clearPoAutoFillBadges(): void {
    setPoAutoFilledFields(new Set());
    poAutoFilledSnapshotRef.current = {};
    setPoLookupStatus("idle");
    setPoLookupResult(null);
    setPoDetailsExpanded(false);
  }

  function applyPoAutoFill(result: PoLookupResult): void {
    const mapped = mapPoResultToFormFields(result);
    const nextBadges = new Set<PoAutoFillField>();
    const snapshot: Partial<Record<PoAutoFillField, string>> = {};

    if (mapped.companyName) {
      snapshot.companyName = mapped.companyName;
      nextBadges.add("companyName");
    }

    if (mapped.contractAmount) {
      snapshot.contractAmount = mapped.contractAmount;
      nextBadges.add("contractAmount");
    }

    if (mapped.contractDescription) {
      snapshot.contractDescription = mapped.contractDescription;
      nextBadges.add("contractDescription");
    }

    if (mapped.department) {
      snapshot.department = mapped.department;
      nextBadges.add("department");
    }

    setForm((current) => ({
      ...current,
      ...(mapped.department ? { department: mapped.department } : {}),
      ...(mapped.contractAmount
        ? { contractAmount: mapped.contractAmount }
        : {}),
      ...(mapped.contractDescription
        ? { contractDescription: mapped.contractDescription }
        : {}),
      ...(mapped.companyName ? { companyName: mapped.companyName } : {}),
    }));

    if (mapped.companyName) {
      setCounterpartySelection(NEW_COUNTERPARTY_VALUE);
    }

    poAutoFilledSnapshotRef.current = snapshot;
    setPoAutoFilledFields(nextBadges);
  }

  function handlePoNumberChange(value: string): void {
    if (value.trim() !== lastLookedUpPoRef.current) {
      clearPoAutoFillBadges();
      lastLookedUpPoRef.current = "";
    }

    handleChange("poNumber", value);
  }

  async function handlePoNumberBlur(): Promise<void> {
    const value = form.poNumber.trim();

    if (
      !poIntegrationEnabled ||
      !poConfig?.autoPopulateOnMatch ||
      value.length < 3 ||
      value === lastLookedUpPoRef.current
    ) {
      return;
    }

    setPoLookupStatus("loading");

    try {
      const response = await fetch(
        `/api/po/lookup?poNumber=${encodeURIComponent(value)}`,
      );

      if (!response.ok) {
        throw new Error("PO lookup failed");
      }

      const result = (await response.json()) as PoLookupResult;
      lastLookedUpPoRef.current = value;
      setPoLookupResult(result);

      if (result.found) {
        setPoLookupStatus("found");

        if (poConfig.autoPopulateOnMatch) {
          applyPoAutoFill(result);
        }
      } else {
        setPoLookupStatus("not_found");
      }
    } catch {
      setPoLookupStatus("error");
      setPoLookupResult(null);
    }
  }

  useDeferredEffect(() => {
    if (!selectedTemplate || selectedTemplateId) {
      return;
    }

    setTemplateVariableValues(
      buildVariableValuesFromIntakeForm(
        selectedTemplate,
        toVariableContext(form),
      ),
    );
    // Sync template variables when intake field values change.
  }, [
    selectedTemplate,
    selectedTemplateId,
    form.companyName,
    form.address,
    form.mainContactName,
    form.mainContactTitle,
    form.mainContactEmail,
    form.mainContactPhone,
    form.contractStartDate,
    form.contractEndDate,
    form.contractAmount,
    form.contractTitle,
    form.poNumber,
  ]);

  function resetContractTypeSelection(): void {
    clearTemplateSelection();
    setShowTemplatePicker(false);
    setContractTypeConfirmed(false);
    setForm((current) => ({
      ...current,
      contractType: "",
      parentAgreementId: "",
    }));
  }

  function clearTemplateDecision(): void {
    setSelectedTemplate(null);
    setSelectedTemplateId(null);
    setSelectedTemplateVersion(null);
    setTemplateVariableValues({});
    setVariableFormError(null);
  }

  function handleChangeContractType(): void {
    setContractTypeConfirmed(false);
    clearTemplateDecision();
    setIntakePath("pick-template");
    setShowTemplatePicker(true);
    window.requestAnimationFrame(() => {
      contractTypeSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function clearTemplateSelection(): void {
    setSelectedTemplate(null);
    setSelectedTemplateId(null);
    setSelectedTemplateVersion(null);
    setTemplateVariableValues({});
    setVariableFormError(null);
    setSelectedTemplateType("");
  }

  function applyContractTypeSelection(templateType: ContractTemplateType): void {
    const configuredType = intakeContractTypes.find(
      (type) => type.slug === templateType,
    );
    const label =
      configuredType?.label ??
      resolveCompanyContractType(templateType, companyConfig);
    const templatesForType = companyTemplates.filter(
      (template) =>
        template.contractType === templateType && template.showInIntake,
    );
    const defaultTemplate = findDefaultTemplateForType(
      templatesForType,
      templateType,
    );

    setSelectedTemplateType(templateType);
    setForm((current) => ({
      ...current,
      contractType: label,
      parentAgreementId: agreementTypeRules.childAgreementTypes.includes(label)
        ? current.parentAgreementId
        : "",
    }));

    if (defaultTemplate) {
      setSelectedTemplate(defaultTemplate);
      setSelectedTemplateId(null);
      setSelectedTemplateVersion(null);
      setTemplateVariableValues(
        buildVariableValuesFromIntakeForm(
          defaultTemplate,
          toVariableContext(form),
        ),
      );
    } else {
      setSelectedTemplate(null);
      setSelectedTemplateId(null);
      setSelectedTemplateVersion(null);
      setTemplateVariableValues({});
    }
  }

  function handleContractTypeSelect(templateType: ContractTemplateType): void {
    if (
      selectedTemplateId &&
      templateType !== selectedTemplateType
    ) {
      setPendingContractTypeChange(templateType);
      return;
    }

    applyContractTypeSelection(templateType);
    setShowTemplatePicker(true);
  }

  function handleCustomFieldChange(key: string, value: string): void {
    setCustomFieldValues((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleChange(
    field: keyof typeof initialFormState,
    value: string,
  ): void {
    setForm((current) => {
      const next = { ...current, [field]: value };

      if (field === "contractAmount" && !isAmountPopulated(value)) {
        setBudgeted(null);
        next.poNumber = "";
      }

      if (
        field === "contractType" &&
        !agreementTypeRules.childAgreementTypes.includes(value)
      ) {
        next.parentAgreementId = "";
      }

      return next;
    });
  }

  function confirmContractTypeChange(): void {
    if (!pendingContractTypeChange) {
      return;
    }

    const nextType = pendingContractTypeChange;
    clearTemplateSelection();
    applyContractTypeSelection(nextType);
    setForm((current) => ({
      ...current,
      contractDescription: "",
      contractTitle: "",
    }));
    setPendingContractTypeChange(null);

    if (intakePath === "form") {
      setIntakePath("pick-template");
      setShowTemplatePicker(false);
      setContractTypeConfirmed(false);
    }
  }

  function cancelContractTypeChange(): void {
    setPendingContractTypeChange(null);
  }

  function handleCompanyChange(nextCompanyId: string): void {
    setCompanyId(nextCompanyId);
    setForm((current) => ({
      ...current,
      department: "",
      contractType: "",
    }));
    clearTemplateSelection();
    setContractTypeConfirmed(false);
    setShowTemplatePicker(false);

    if (
      selectedTemplate &&
      selectedTemplate.organizationId !== nextCompanyId
    ) {
      setError(
        "Company profile changed. Regenerate the contract from a template for this company or start from scratch.",
      );
    }
  }

  function handleCounterpartyChange(selection: string): void {
    setCounterpartySelection(selection);

    if (selection === "" || selection === NEW_COUNTERPARTY_VALUE) {
      setForm((current) => ({
        ...current,
        companyName: "",
        mainContactName: "",
        mainContactTitle: "",
        mainContactEmail: "",
        mainContactPhone: "",
        address: "",
      }));
      return;
    }

    const profile = counterparties.find((entry) => entry.id === selection);

    if (profile) {
      setForm((current) => ({
        ...current,
        companyName: profile.name,
        mainContactName: profile.mainContactName ?? "",
        mainContactTitle: profile.mainContactTitle ?? "",
        mainContactEmail: profile.mainContactEmail ?? "",
        mainContactPhone: profile.mainContactPhone ?? "",
        address: profile.address,
      }));
    }
  }

  const isNewCounterparty = counterpartySelection === NEW_COUNTERPARTY_VALUE;
  const isExistingCounterparty =
    counterpartySelection !== "" &&
    counterpartySelection !== NEW_COUNTERPARTY_VALUE;
  const isChildAgreement = agreementTypeRules.childAgreementTypes.includes(
    form.contractType,
  );
  const generatedFromTemplate = Boolean(selectedTemplateId);

  function handleChooseScratch(): void {
    setSelectedTemplate(null);
    setSelectedTemplateId(null);
    setSelectedTemplateVersion(null);
    setTemplateVariableValues({});
    setVariableFormError(null);
    setShowTemplatePicker(false);
    setContractTypeConfirmed(true);
    setIntakePath("form");
  }

  function handleTemplateSelected(template: ContractTemplateRecord): void {
    setSelectedTemplate(template);
    setSelectedTemplateType(template.contractType);
    setCompanyId(template.organizationId);
    setTemplateVariableValues(
      buildVariableValuesFromIntakeForm(template, toVariableContext(form)),
    );
    setVariableFormError(null);
    setError(null);

    const label = resolveCompanyContractType(
      template.contractType,
      getCompanyConfig(template.organizationId),
    );
    setForm((current) => ({
      ...current,
      contractType: label,
    }));
    setShowTemplatePicker(false);
    setContractTypeConfirmed(true);
    setIntakePath("form");
  }

  function handleGenerateContract(): void {
    if (!selectedTemplate) {
      return;
    }

    const validationError = validateTemplateVariableValues(
      selectedTemplate.variables,
      templateVariableValues,
    );

    if (validationError) {
      setVariableFormError(validationError);
      return;
    }

    const templateCompanyConfig = getCompanyConfig(selectedTemplate.organizationId);
    const generatedBody = buildGeneratedContractSummary(
      selectedTemplate.title,
      selectedTemplate.version,
      selectedTemplate.variables,
      templateVariableValues,
    );
    const mappedContractType = resolveCompanyContractType(
      selectedTemplate.contractType,
      templateCompanyConfig,
    );

    setForm((current) => ({
      ...current,
      contractType: mappedContractType,
      contractTitle: current.contractTitle || selectedTemplate.title,
      contractDescription: generatedBody,
    }));
    setSelectedTemplateId(selectedTemplate.id);
    setSelectedTemplateVersion(selectedTemplate.version);
    setVariableFormError(null);
    setError(null);
    setIntakePath("form");

    void recordContractDraftGeneratedAction({
      organizationId: selectedTemplate.organizationId,
      templateId: selectedTemplate.id,
      templateTitle: selectedTemplate.title,
      templateVersion: selectedTemplate.version,
    });
  }

  function handleVariableChange(name: string, value: string): void {
    setTemplateVariableValues((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function updatePendingAttachment(
    id: string,
    updates: Partial<PendingAttachment>,
  ): void {
    setPendingAttachments((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, ...updates } : entry,
      ),
    );
  }

  function addPendingAttachment(): void {
    setPendingAttachments((current) => [...current, createPendingAttachment()]);
  }

  function removePendingAttachment(id: string): void {
    setPendingAttachments((current) => {
      const next = current.filter((entry) => entry.id !== id);
      return next.length > 0 ? next : [createPendingAttachment()];
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);

    if (
      intakeLayout.isSectionVisible("counterparty_information") &&
      intakeLayout.isFieldVisible("counterparty_information", "counterpartyProfile") &&
      !counterpartySelection
    ) {
      setError("Select a saved counterparty or create a new counterparty profile.");
      return;
    }

    if (
      intakeLayout.isFieldVisible("contract_details", "budgeted") &&
      isAmountPopulated(form.contractAmount) &&
      budgeted === null
    ) {
      setError("Select whether this contract is budgeted (Yes or No).");
      return;
    }

    if (
      intakeLayout.isFieldVisible("contract_details", "parentAgreementId") &&
      isChildAgreement &&
      !form.parentAgreementId
    ) {
      setError("Select the active parent agreement for this child agreement.");
      return;
    }

    if (
      intakeLayout.isFieldVisible("contract_details", "poNumber") &&
      poRequiredForType &&
      !form.poNumber.trim()
    ) {
      setError("PO number is required for this contract type.");
      return;
    }

    for (const section of intakeLayout.customSections()) {
      for (const field of section.fields) {
        if (field.isRequired && !customFieldValues[field.key]?.trim()) {
          setError(`Enter a value for "${field.label}".`);
          return;
        }
      }
    }

    if (!form.contractType || !selectedTemplateType) {
      setError("Select a contract type.");
      return;
    }

    if (selectedTemplate && !selectedTemplateId) {
      setError(
        "Generate the contract from your template variables before submitting.",
      );
      return;
    }

    if (
      selectedTemplateId &&
      selectedTemplate &&
      selectedTemplate.organizationId !== companyId
    ) {
      setError(
        "Selected template does not belong to the current company profile.",
      );
      return;
    }

    const completedAttachments = pendingAttachments.filter(
      (entry) => entry.file || entry.documentType,
    );

    for (const entry of completedAttachments) {
      if (!entry.file || !entry.documentType) {
        setError(
          "Each attachment row must include both a document type and a file.",
        );
        return;
      }

      if (entry.file.size > MAX_INTAKE_ATTACHMENT_BYTES) {
        setError(`"${entry.file.name}" must be 10 MB or smaller.`);
        return;
      }
    }

    startTransition(async () => {
      try {
        const attachments = await Promise.all(
          completedAttachments.map(async (entry) => ({
            fileName: entry.file!.name,
            mimeType: entry.file!.type || "application/octet-stream",
            sizeBytes: entry.file!.size,
            documentType: entry.documentType as IntakeDocumentType,
            dataBase64: await readFileAsBase64(entry.file!),
          })),
        );

        let counterpartyId = isExistingCounterparty
          ? counterpartySelection
          : undefined;

        if (isNewCounterparty) {
          counterpartyId = await createCounterpartyForIntakeAction({
            companyName: form.companyName,
            mainContactName: form.mainContactName,
            mainContactTitle: form.mainContactTitle || undefined,
            mainContactEmail: form.mainContactEmail,
            mainContactPhone: form.mainContactPhone || undefined,
            address: form.address,
          });
        }

        const payload: ContractIntakeInput = {
          requesterName,
          requesterEmail: "pending@client",
          department: form.department,
          contractType: form.contractType,
          contractStartDate: form.contractStartDate,
          contractEndDate: form.contractEndDate,
          contractTitle: form.contractTitle,
          contractDescription: form.contractDescription,
          contractAmount: form.contractAmount ?? "",
          budgeted: isAmountPopulated(form.contractAmount)
            ? budgeted ?? undefined
            : undefined,
          poNumber:
            isAmountPopulated(form.contractAmount) || poRequiredForType
              ? form.poNumber
              : undefined,
          parentAgreementId: isChildAgreement
            ? form.parentAgreementId
            : undefined,
          otherNotes: form.otherNotes,
          companyName: form.companyName,
          address: form.address,
          mainContactName: form.mainContactName,
          mainContactTitle: form.mainContactTitle || undefined,
          mainContactEmail: form.mainContactEmail,
          mainContactPhone: form.mainContactPhone || undefined,
          counterpartyId,
          companyProfileId: companyId,
          attachments: attachments.length > 0 ? attachments : undefined,
          templateId: selectedTemplateId ?? undefined,
          templateVersion: selectedTemplateVersion ?? undefined,
          intakeFormId: intakeFormLayout?.id,
          customFields:
            Object.keys(customFieldValues).length > 0
              ? customFieldValues
              : undefined,
        };

        const response = await fetch("/api/contracts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error ?? "Failed to create contract");
        }

        const record = (await response.json()) as ContractRecord;
        router.push(`/contracts/${record.id}`);
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Unable to submit contract request.",
        );
      }
    });
  }

  const currentStep = resolveIntakeStepIndex(
    intakePath,
    selectedTemplateType,
    selectedTemplate,
    selectedTemplateId,
    showTemplatePicker,
  );

  const useSidebarLayout = intakePath === "form";

  return (
    <div
      className={
        useSidebarLayout
          ? "lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start lg:gap-8"
          : "w-full"
      }
    >
      <form onSubmit={handleSubmit} className="min-w-0 space-y-8">
      <ContractIntakeStepProgress
        currentStep={currentStep}
        variant="bar"
      />

      {intakePath === "pick-template" ? (
        <>
          <section
            ref={contractTypeSectionRef}
            className="rounded-xl border border-border bg-surface p-6 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Select contract type
                </h2>
                <p className="mt-1 text-sm text-text-muted">
                  Step {currentStep} of {INTAKE_FORM_STEP_COUNT} · Choose the
                  agreement type to continue.
                </p>
              </div>
              {!selectedTemplateType ? (
                <Link
                  href="/dashboard"
                  className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-muted"
                >
                  Back to dashboard
                </Link>
              ) : null}
            </div>
            {!contractTypeConfirmed ? (
              <div className="mt-6 w-full">
                <ContractTypeCardPicker
                  contractTypes={intakeContractTypes}
                  selectedType={selectedTemplateType}
                  onSelect={handleContractTypeSelect}
                />
              </div>
            ) : null}
          </section>

          {selectedTemplateType && showTemplatePicker && !contractTypeConfirmed ? (
            <ContractTemplatePicker
              templates={companyTemplates}
              contractTypeFilter={selectedTemplateType}
              selectedTemplateId={selectedTemplate?.id ?? null}
              onSelect={handleTemplateSelected}
              onSelectNoTemplate={handleChooseScratch}
              onBack={resetContractTypeSelection}
            />
          ) : null}
        </>
      ) : null}

      {intakePath === "form" ? (
        <>
      {generatedFromTemplate && selectedTemplate ? (
        <section className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4">
          <p className="text-sm text-indigo-900">
            Generated from template{" "}
            <span className="font-medium">{selectedTemplate.title}</span> (v
            {selectedTemplateVersion}) for{" "}
            {getCompanyConfig(selectedTemplate.organizationId).name}. You can edit
            the contract body before submitting.
          </p>
        </section>
      ) : null}

      {intakeLayout.isSectionVisible("company_configuration") ? (
      <section className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">
          {intakeLayout.getSectionLabel(
            "company_configuration",
            "Company configuration",
          )}
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          {intakeLayout.getSectionDescription(
            "company_configuration",
            "Department and contract type options change based on the selected company profile.",
          )}
        </p>
        {intakeLayout.isFieldVisible("company_configuration", "companyProfile") ? (
        <div className="mt-5 max-w-md">
          <FormField
            label={intakeLayout.getFieldLabel(
              "company_configuration",
              "companyProfile",
              "Company profile",
            )}
            htmlFor="companyProfile"
          >
            <select
              id="companyProfile"
              value={companyId}
              onChange={(event) => handleCompanyChange(event.target.value)}
              className={selectClassName}
            >
              {getAvailableCompanyConfigs().map((config) => (
                <option key={config.id} value={config.id}>
                  {config.name}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        ) : null}
      </section>
      ) : null}

      {intakeLayout.isSectionVisible("requester_information") ? (
      <section className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">
          {intakeLayout.getSectionLabel(
            "requester_information",
            "Requester information",
          )}
        </h2>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {intakeLayout.isFieldVisible("requester_information", "requesterName") ? (
          <FormField
            label={intakeLayout.getFieldLabel(
              "requester_information",
              "requesterName",
              "Requester name",
            )}
            htmlFor="requesterName"
            hint={intakeLayout.getFieldHelpText(
              "requester_information",
              "requesterName",
              "Auto-filled from your signed-in account.",
            )}
          >
            <input
              id="requesterName"
              name="requesterName"
              type="text"
              value={requesterName}
              readOnly
              className={readOnlyInputClassName}
            />
          </FormField>
          ) : null}

          {intakeLayout.isFieldVisible("requester_information", "department") ? (
          <FormField
            label={intakeLayout.getFieldLabel(
              "requester_information",
              "department",
              "Department",
            )}
            htmlFor="department"
          >
            <select
              id="department"
              name="department"
              required={intakeLayout.isFieldRequired(
                "requester_information",
                "department",
                true,
              )}
              value={form.department}
              onChange={(event) => {
                handleChange("department", event.target.value);
                clearPoBadgeIfEdited("department", event.target.value);
              }}
              className={selectClassName}
            >
              <option value="">Select a department</option>
              {companyConfig.departments.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
            {renderPoAutoFillBadge("department")}
          </FormField>
          ) : null}
        </div>
      </section>
      ) : null}

      {intakeLayout.isSectionVisible("contract_details") ? (
      <section className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">
          {intakeLayout.getSectionLabel("contract_details", "Contract details")}
        </h2>

        {contractTypeConfirmed && selectedTemplateType ? (
          <div className="mt-5 space-y-4">
            <div>
              <p className="mb-4 text-sm font-medium text-foreground">
                Contract type
              </p>
              <SelectedContractTypeCard
                companyConfig={companyConfig}
                contractType={selectedTemplateType}
                onChange={handleChangeContractType}
              />
            </div>
            <div>
              <p className="mb-4 text-sm font-medium text-foreground">
                Template
              </p>
              {selectedTemplate ? (
                <SelectedTemplateSummaryCard template={selectedTemplate} />
              ) : (
                <NoTemplateSummaryCard />
              )}
            </div>
          </div>
        ) : null}

        <input
          type="hidden"
          id="contractType"
          name="contractType"
          value={form.contractType}
          required
        />

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {isChildAgreement &&
          intakeLayout.isFieldVisible("contract_details", "parentAgreementId") ? (
            <div className="md:col-span-2">
              <FormField
                label={intakeLayout.getFieldLabel(
                  "contract_details",
                  "parentAgreementId",
                  "Parent agreement",
                )}
                htmlFor="parentAgreementId"
                hint={intakeLayout.getFieldHelpText(
                  "contract_details",
                  "parentAgreementId",
                  "Required for child agreements. Search by record ID, title, counterparty, or agreement type.",
                )}
              >
                <ParentAgreementSearchField
                  id="parentAgreementId"
                  options={parentAgreementOptions}
                  value={form.parentAgreementId}
                  onChange={(contractId) =>
                    handleChange("parentAgreementId", contractId)
                  }
                  required={intakeLayout.isFieldRequired(
                    "contract_details",
                    "parentAgreementId",
                    true,
                  )}
                />
              </FormField>
            </div>
          ) : (
            <div className="hidden md:block" />
          )}

          {intakeLayout.isFieldVisible("contract_details", "contractStartDate") ||
          intakeLayout.isFieldVisible("contract_details", "contractEndDate") ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:col-span-2">
            {intakeLayout.isFieldVisible("contract_details", "contractStartDate") ? (
            <FormField
              label={intakeLayout.getFieldLabel(
                "contract_details",
                "contractStartDate",
                "Contract start date",
              )}
              htmlFor="contractStartDate"
            >
              <input
                id="contractStartDate"
                name="contractStartDate"
                type="date"
                required={intakeLayout.isFieldRequired(
                  "contract_details",
                  "contractStartDate",
                  true,
                )}
                value={form.contractStartDate}
                onChange={(event) =>
                  handleChange("contractStartDate", event.target.value)
                }
                className={inputClassName}
              />
            </FormField>
            ) : null}

            {intakeLayout.isFieldVisible("contract_details", "contractEndDate") ? (
            <FormField
              label={intakeLayout.getFieldLabel(
                "contract_details",
                "contractEndDate",
                "Contract end date",
              )}
              htmlFor="contractEndDate"
            >
              <input
                id="contractEndDate"
                name="contractEndDate"
                type="date"
                required={intakeLayout.isFieldRequired(
                  "contract_details",
                  "contractEndDate",
                  true,
                )}
                min={form.contractStartDate || undefined}
                value={form.contractEndDate}
                onChange={(event) =>
                  handleChange("contractEndDate", event.target.value)
                }
                className={inputClassName}
              />
            </FormField>
            ) : null}
          </div>
          ) : null}

          {intakeLayout.isFieldVisible("contract_details", "contractTitle") ? (
          <FormField
            label={intakeLayout.getFieldLabel(
              "contract_details",
              "contractTitle",
              "Contract title",
            )}
            htmlFor="contractTitle"
          >
            <input
              id="contractTitle"
              name="contractTitle"
              type="text"
              required={intakeLayout.isFieldRequired(
                "contract_details",
                "contractTitle",
                true,
              )}
              placeholder={
                intakeLayout.getField("contract_details", "contractTitle")
                  ?.placeholder ?? "Master Services Agreement — Acme Corp"
              }
              value={form.contractTitle}
              onChange={(event) =>
                handleChange("contractTitle", event.target.value)
              }
              className={inputClassName}
            />
          </FormField>
          ) : null}

          {intakeLayout.isFieldVisible("contract_details", "contractAmount") ? (
          <FormField
            label={intakeLayout.getFieldLabel(
              "contract_details",
              "contractAmount",
              "Contract amount",
            )}
            htmlFor="contractAmount"
            hint={intakeLayout.getFieldHelpText(
              "contract_details",
              "contractAmount",
              "Optional. Leave blank for agreements without a dollar value.",
            )}
          >
            <input
              id="contractAmount"
              name="contractAmount"
              type="text"
              placeholder={
                intakeLayout.getField("contract_details", "contractAmount")
                  ?.placeholder ?? "$240,000"
              }
              value={form.contractAmount}
              onChange={(event) => {
                handleChange("contractAmount", event.target.value);
                clearPoBadgeIfEdited("contractAmount", event.target.value);
              }}
              className={inputClassName}
            />
            {renderPoAutoFillBadge("contractAmount")}
          </FormField>
          ) : null}

          {intakeLayout.isFieldVisible("contract_details", "budgeted") &&
          isAmountPopulated(form.contractAmount) ? (
            <div className="md:col-span-2">
              <FormField
                label={intakeLayout.getFieldLabel(
                  "contract_details",
                  "budgeted",
                  "Budgeted?",
                )}
                htmlFor="budgeted-yes"
                hint={intakeLayout.getFieldHelpText(
                  "contract_details",
                  "budgeted",
                  "Required when a contract amount is entered.",
                )}
              >
                <fieldset className="mt-2">
                  <div className="flex flex-wrap gap-6">
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        id="budgeted-yes"
                        name="budgeted"
                        type="radio"
                        checked={budgeted === true}
                        onChange={() => setBudgeted(true)}
                        required={intakeLayout.isFieldRequired(
                          "contract_details",
                          "budgeted",
                          true,
                        )}
                        className="h-4 w-4 border-border text-accent"
                      />
                      Yes
                    </label>
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        id="budgeted-no"
                        name="budgeted"
                        type="radio"
                        checked={budgeted === false}
                        onChange={() => setBudgeted(false)}
                        required={intakeLayout.isFieldRequired(
                          "contract_details",
                          "budgeted",
                          true,
                        )}
                        className="h-4 w-4 border-border text-accent"
                      />
                      No
                    </label>
                  </div>
                </fieldset>
              </FormField>
            </div>
          ) : null}

          {intakeLayout.isFieldVisible("contract_details", "poNumber") &&
          showPoNumberField ? (
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <label
                  htmlFor="poNumber"
                  className="text-sm font-medium text-foreground"
                >
                  {poIntegrationEnabled ? (
                    <>
                      PO number — pulls from {poDisplayName}
                      {poRequiredForType ? (
                        <span className="text-rose-600"> *</span>
                      ) : null}
                    </>
                  ) : (
                    <>
                      PO number (optional)
                      {poRequiredForType ? (
                        <span className="text-rose-600"> *</span>
                      ) : null}
                    </>
                  )}
                </label>
                {poIntegrationEnabled ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                    <PlugIcon />
                    Connected
                  </span>
                ) : null}
              </div>

              <div className="relative">
                <input
                  id="poNumber"
                  name="poNumber"
                  type="text"
                  required={poRequiredForType}
                  placeholder="PO-2026-11842"
                  value={form.poNumber}
                  onChange={(event) =>
                    handlePoNumberChange(event.target.value)
                  }
                  onBlur={() => {
                    void handlePoNumberBlur();
                  }}
                  className={`${inputClassName} ${poLookupStatus === "loading" ? "pr-10" : ""}`}
                />
                {poLookupStatus === "loading" ? (
                  <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                    <PoSpinner />
                  </div>
                ) : null}
              </div>

              {poLookupStatus === "loading" ? (
                <p className="mt-1 text-xs text-gray-400">
                  Looking up PO in {poDisplayName}...
                </p>
              ) : null}

              {poLookupStatus === "found" ? (
                <p className="mt-1 text-xs text-green-700">
                  ✓ PO found in {poDisplayName}
                </p>
              ) : null}

              {poLookupStatus === "not_found" ? (
                <p className="mt-1 text-xs text-gray-500">
                  PO not found in {poDisplayName}. You can still continue.
                </p>
              ) : null}

              {poLookupStatus === "error" ? (
                <p className="mt-1 text-xs text-gray-500">
                  Could not connect to {poDisplayName}. You can still enter
                  details manually.
                </p>
              ) : null}

              {poLookupResult?.found ? (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() =>
                      setPoDetailsExpanded((current) => !current)
                    }
                    className="text-xs font-medium text-blue-600 hover:text-blue-800"
                  >
                    {poDetailsExpanded ? "Hide PO details" : "Show PO details"}
                  </button>
                  {poDetailsExpanded ? (
                    <dl className="mt-2 space-y-1 rounded-md border border-border bg-surface-muted p-3 text-xs text-gray-600">
                      {poLookupResult.vendor ? (
                        <div className="flex gap-2">
                          <dt className="font-medium text-gray-700">Vendor:</dt>
                          <dd>{poLookupResult.vendor}</dd>
                        </div>
                      ) : null}
                      {poLookupResult.amount !== null ? (
                        <div className="flex gap-2">
                          <dt className="font-medium text-gray-700">Amount:</dt>
                          <dd>
                            {poLookupResult.amount}
                            {poLookupResult.currency
                              ? ` ${poLookupResult.currency}`
                              : ""}
                          </dd>
                        </div>
                      ) : null}
                      {poLookupResult.description ? (
                        <div className="flex gap-2">
                          <dt className="font-medium text-gray-700">
                            Description:
                          </dt>
                          <dd>{poLookupResult.description}</dd>
                        </div>
                      ) : null}
                      {poLookupResult.requestedBy ? (
                        <div className="flex gap-2">
                          <dt className="font-medium text-gray-700">
                            Requested by:
                          </dt>
                          <dd>{poLookupResult.requestedBy}</dd>
                        </div>
                      ) : null}
                      {poLookupResult.department ? (
                        <div className="flex gap-2">
                          <dt className="font-medium text-gray-700">
                            Department:
                          </dt>
                          <dd>{poLookupResult.department}</dd>
                        </div>
                      ) : null}
                      {poLookupResult.costCenter ? (
                        <div className="flex gap-2">
                          <dt className="font-medium text-gray-700">
                            Cost center:
                          </dt>
                          <dd>{poLookupResult.costCenter}</dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {intakeLayout.isFieldVisible("contract_details", "contractDescription") ? (
          <div className="md:col-span-2">
            <FormField
              label={
                generatedFromTemplate
                  ? "Contract body"
                  : intakeLayout.getFieldLabel(
                      "contract_details",
                      "contractDescription",
                      "Contract description",
                    )
              }
              htmlFor="contractDescription"
              hint={
                generatedFromTemplate
                  ? "Generated from your template. Edit freely before submitting."
                  : intakeLayout.getFieldHelpText(
                      "contract_details",
                      "contractDescription",
                    )
              }
            >
              <textarea
                id="contractDescription"
                name="contractDescription"
                rows={generatedFromTemplate ? 12 : 4}
                required={intakeLayout.isFieldRequired(
                  "contract_details",
                  "contractDescription",
                  true,
                )}
                placeholder={
                  intakeLayout.getField("contract_details", "contractDescription")
                    ?.placeholder ??
                  "Brief summary of scope, deliverables, and key terms."
                }
                value={form.contractDescription}
                onChange={(event) => {
                  handleChange("contractDescription", event.target.value);
                  clearPoBadgeIfEdited(
                    "contractDescription",
                    event.target.value,
                  );
                }}
                className={
                  generatedFromTemplate
                    ? `${textareaClassName} min-h-72 font-mono text-sm leading-6`
                    : textareaClassName
                }
              />
              {renderPoAutoFillBadge("contractDescription")}
            </FormField>
          </div>
          ) : null}

          {intakeLayout.isFieldVisible("contract_details", "otherNotes") ? (
          <div className="md:col-span-2">
            <FormField
              label={intakeLayout.getFieldLabel(
                "contract_details",
                "otherNotes",
                "Other notes",
              )}
              htmlFor="otherNotes"
            >
              <textarea
                id="otherNotes"
                name="otherNotes"
                rows={3}
                placeholder={
                  intakeLayout.getField("contract_details", "otherNotes")
                    ?.placeholder ?? "Optional context for approvers."
                }
                value={form.otherNotes}
                onChange={(event) =>
                  handleChange("otherNotes", event.target.value)
                }
                className={textareaClassName}
              />
            </FormField>
          </div>
          ) : null}
        </div>
      </section>
      ) : null}

      {intakeLayout.isSectionVisible("supporting_documents") ? (
      <section className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {intakeLayout.getSectionLabel(
                "supporting_documents",
                "Supporting documents",
              )}
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              {intakeLayout.getSectionDescription(
                "supporting_documents",
                "Optionally attach one or more documents. The uploaded file name becomes the attachment title on the contract record.",
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={addPendingAttachment}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-muted"
          >
            Add another document
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {pendingAttachments.map((entry, index) => (
            <div
              key={entry.id}
              className="rounded-md border border-border bg-surface-muted p-4"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">
                  Document {index + 1}
                </p>
                {pendingAttachments.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removePendingAttachment(entry.id)}
                    className="text-sm font-medium text-text-secondary hover:text-foreground"
                  >
                    Remove
                  </button>
                ) : null}
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <FormField
                  label="Document type"
                  htmlFor={`documentType-${entry.id}`}
                >
                  <select
                    id={`documentType-${entry.id}`}
                    value={entry.documentType}
                    onChange={(event) =>
                      updatePendingAttachment(entry.id, {
                        documentType: event.target.value as
                          | IntakeDocumentType
                          | "",
                      })
                    }
                    className={selectClassName}
                  >
                    <option value="">Select a document type (optional)</option>
                    {INTAKE_DOCUMENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {INTAKE_DOCUMENT_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField
                  label="Upload document"
                  htmlFor={`attachment-${entry.id}`}
                  hint="Optional. PDF, Word, Excel, or image files up to 10 MB."
                >
                  <input
                    id={`attachment-${entry.id}`}
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.txt,.csv"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      updatePendingAttachment(entry.id, { file });
                    }}
                    className="block w-full text-sm text-text-secondary file:mr-4 file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-border"
                  />
                  {entry.file ? (
                    <p className="mt-2 text-sm text-text-secondary">
                      Title: {entry.file.name} (
                      {(entry.file.size / 1024).toFixed(1)} KB)
                    </p>
                  ) : null}
                </FormField>
              </div>
            </div>
          ))}
        </div>
      </section>
      ) : null}

      {intakeLayout.isSectionVisible("counterparty_information") ? (
      <section className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">
          {intakeLayout.getSectionLabel(
            "counterparty_information",
            "Counterparty information",
          )}
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          {intakeLayout.getSectionDescription(
            "counterparty_information",
            "Choose a saved counterparty profile or create a new one for this request.",
          )}
        </p>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {intakeLayout.isFieldVisible(
            "counterparty_information",
            "counterpartyProfile",
          ) ? (
          <div className="md:col-span-2">
            <FormField
              label={intakeLayout.getFieldLabel(
                "counterparty_information",
                "counterpartyProfile",
                "Counterparty",
              )}
              htmlFor="counterpartyProfile"
            >
              <select
                id="counterpartyProfile"
                required={intakeLayout.isFieldRequired(
                  "counterparty_information",
                  "counterpartyProfile",
                  true,
                )}
                value={counterpartySelection}
                onChange={(event) =>
                  handleCounterpartyChange(event.target.value)
                }
                className={selectClassName}
              >
                <option value="">Select a counterparty</option>
                {counterparties.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
                <option value={NEW_COUNTERPARTY_VALUE}>
                  + Create new counterparty
                </option>
              </select>
            </FormField>
          </div>
          ) : null}

          {isExistingCounterparty ? (
            <p className="md:col-span-2 text-sm text-text-secondary">
              Name, contact details, and address are pulled from the saved
              counterparty profile.
            </p>
          ) : null}

          {isNewCounterparty ? (
            <p className="md:col-span-2 text-sm text-text-secondary">
              Enter details for the new counterparty. The profile will be saved
              for future contract requests.
            </p>
          ) : null}

          {counterpartySelection ? (
            <>
              {intakeLayout.isFieldVisible(
                "counterparty_information",
                "companyName",
              ) ? (
              <FormField
                label={intakeLayout.getFieldLabel(
                  "counterparty_information",
                  "companyName",
                  "Company name",
                )}
                htmlFor="companyName"
              >
                <input
                  id="companyName"
                  name="companyName"
                  type="text"
                  required={intakeLayout.isFieldRequired(
                    "counterparty_information",
                    "companyName",
                    true,
                  )}
                  readOnly={isExistingCounterparty}
                  placeholder={
                    intakeLayout.getField("counterparty_information", "companyName")
                      ?.placeholder ?? "Acme Corp"
                  }
                  value={form.companyName}
                  onChange={(event) => {
                    handleChange("companyName", event.target.value);
                    clearPoBadgeIfEdited("companyName", event.target.value);
                  }}
                  className={
                    isExistingCounterparty
                      ? readOnlyInputClassName
                      : inputClassName
                  }
                />
                {renderPoAutoFillBadge("companyName")}
              </FormField>
              ) : null}

              {intakeLayout.isFieldVisible(
                "counterparty_information",
                "mainContactName",
              ) ? (
              <FormField
                label={intakeLayout.getFieldLabel(
                  "counterparty_information",
                  "mainContactName",
                  "Primary contact at counterparty",
                )}
                htmlFor="mainContactPicker"
                hint="Search your company directory for an internal contact. Counterparty email can still be entered below."
              >
                <PeoplePicker
                  label=""
                  value={
                    form.mainContactName.trim() || form.mainContactEmail.trim()
                      ? {
                          name:
                            form.mainContactName.trim() ||
                            form.mainContactEmail.trim(),
                          email: form.mainContactEmail.trim(),
                        }
                      : null
                  }
                  onChange={(user) => {
                    if (!user) {
                      handleChange("mainContactName", "");
                      handleChange("mainContactEmail", "");
                      return;
                    }

                    handleChange("mainContactName", user.name);
                    handleChange("mainContactEmail", user.email);

                    if (user.jobTitle) {
                      handleChange("mainContactTitle", user.jobTitle);
                    }
                  }}
                  disabled={isExistingCounterparty}
                  required={intakeLayout.isFieldRequired(
                    "counterparty_information",
                    "mainContactName",
                    false,
                  )}
                  placeholder="Search by name or email..."
                />
              </FormField>
              ) : null}

              {intakeLayout.isFieldVisible(
                "counterparty_information",
                "mainContactTitle",
              ) ? (
              <FormField
                label={intakeLayout.getFieldLabel(
                  "counterparty_information",
                  "mainContactTitle",
                  "Main Contact Title",
                )}
                htmlFor="mainContactTitle"
                hint="Optional."
              >
                <input
                  id="mainContactTitle"
                  name="mainContactTitle"
                  type="text"
                  readOnly={isExistingCounterparty}
                  placeholder="Director of Procurement"
                  value={form.mainContactTitle}
                  onChange={(event) =>
                    handleChange("mainContactTitle", event.target.value)
                  }
                  className={
                    isExistingCounterparty
                      ? readOnlyInputClassName
                      : inputClassName
                  }
                />
              </FormField>
              ) : null}

              {intakeLayout.isFieldVisible(
                "counterparty_information",
                "mainContactEmail",
              ) ? (
              <FormField
                label={intakeLayout.getFieldLabel(
                  "counterparty_information",
                  "mainContactEmail",
                  "Main Contact Email",
                )}
                htmlFor="mainContactEmail"
              >
                <input
                  id="mainContactEmail"
                  name="mainContactEmail"
                  type="email"
                  required={intakeLayout.isFieldRequired(
                    "counterparty_information",
                    "mainContactEmail",
                    true,
                  )}
                  readOnly={isExistingCounterparty}
                  placeholder="jane@acme.com"
                  value={form.mainContactEmail}
                  onChange={(event) =>
                    handleChange("mainContactEmail", event.target.value)
                  }
                  className={
                    isExistingCounterparty
                      ? readOnlyInputClassName
                      : inputClassName
                  }
                />
              </FormField>
              ) : null}

              {intakeLayout.isFieldVisible(
                "counterparty_information",
                "mainContactPhone",
              ) ? (
              <FormField
                label={intakeLayout.getFieldLabel(
                  "counterparty_information",
                  "mainContactPhone",
                  "Main Contact Phone Number",
                )}
                htmlFor="mainContactPhone"
                hint="Optional."
              >
                <input
                  id="mainContactPhone"
                  name="mainContactPhone"
                  type="tel"
                  readOnly={isExistingCounterparty}
                  placeholder="+1 (415) 555-0142"
                  value={form.mainContactPhone}
                  onChange={(event) =>
                    handleChange("mainContactPhone", event.target.value)
                  }
                  className={
                    isExistingCounterparty
                      ? readOnlyInputClassName
                      : inputClassName
                  }
                />
              </FormField>
              ) : null}

              {intakeLayout.isFieldVisible("counterparty_information", "address") ? (
              <div className="md:col-span-2">
                <FormField
                  label={intakeLayout.getFieldLabel(
                    "counterparty_information",
                    "address",
                    "Address",
                  )}
                  htmlFor="address"
                >
                  <textarea
                    id="address"
                    name="address"
                    rows={3}
                    required={intakeLayout.isFieldRequired(
                      "counterparty_information",
                      "address",
                      false,
                    )}
                    readOnly={isExistingCounterparty}
                    placeholder="123 Market Street, San Francisco, CA 94105"
                    value={form.address}
                    onChange={(event) =>
                      handleChange("address", event.target.value)
                    }
                    className={
                      isExistingCounterparty
                        ? readOnlyInputClassName
                        : textareaClassName
                    }
                  />
                </FormField>
              </div>
              ) : null}
            </>
          ) : null}
        </div>
      </section>
      ) : null}

      <CustomIntakeSections
        sections={intakeLayout.customSections()}
        values={customFieldValues}
        onChange={handleCustomFieldChange}
      />

      {selectedTemplate && !selectedTemplateId ? (
        <TemplateVariableForm
          variables={selectedTemplate.variables}
          values={templateVariableValues}
          error={variableFormError}
          onChange={handleVariableChange}
          onBack={() => {
            clearTemplateSelection();
            setIntakePath("pick-template");
          }}
          onGenerate={handleGenerateContract}
        />
      ) : null}

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        <Link
          href="/dashboard"
          className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-muted"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {isPending ? "Submitting..." : "Submit for approval"}
        </button>
      </div>
        </>
      ) : null}

      {pendingContractTypeChange ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground">
              Change contract type?
            </h3>
            <p className="mt-3 text-sm leading-6 text-text-muted">
              Changing the contract type will clear your selected template and
              any values you have entered. Continue?
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelContractTypeChange}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmContractTypeChange}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </form>

      {useSidebarLayout ? (
        <ContractIntakeStepProgress
          currentStep={currentStep}
          variant="sidebar"
        />
      ) : null}
    </div>
  );
}
