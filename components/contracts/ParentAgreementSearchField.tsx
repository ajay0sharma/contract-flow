"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useDeferredEffect } from "@/lib/use-deferred-effect";
import { inputClassName } from "@/components/ui/FormField";
import { resolveContractRecordNumber } from "@/lib/record-id";
import type { ContractRecord } from "@/types/contract";

interface ParentAgreementSearchFieldProps {
  id: string;
  options: ContractRecord[];
  value: string;
  onChange: (contractId: string) => void;
  required?: boolean;
}

function searchableText(contract: ContractRecord): string {
  return [
    resolveContractRecordNumber(contract),
    contract.title,
    contract.companyName,
    contract.contractType,
    contract.department,
  ]
    .join(" ")
    .toLowerCase();
}

function matchesQuery(contract: ContractRecord, query: string): boolean {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);

  if (terms.length === 0) {
    return true;
  }

  const haystack = searchableText(contract);
  return terms.every((term) => haystack.includes(term));
}

export function ParentAgreementSearchField({
  id,
  options,
  value,
  onChange,
  required = false,
}: ParentAgreementSearchFieldProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const selectedContract = useMemo(
    () => options.find((contract) => contract.id === value),
    [options, value],
  );

  const filteredOptions = useMemo(() => {
    if (!query.trim()) {
      return options;
    }

    return options.filter((contract) => matchesQuery(contract, query));
  }, [options, query]);

  useDeferredEffect(() => {
    setHighlightedIndex(0);
  }, [query, isOpen]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent): void {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function openDropdown(): void {
    setIsOpen(true);
  }

  function selectContract(contract: ContractRecord): void {
    onChange(contract.id);
    setQuery("");
    setIsOpen(false);
    inputRef.current?.blur();
  }

  function clearSelection(): void {
    onChange("");
    setQuery("");
    setIsOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (!isOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      setIsOpen(true);
      return;
    }

    if (event.key === "Escape") {
      setIsOpen(false);
      return;
    }

    if (!isOpen || filteredOptions.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) =>
        current + 1 >= filteredOptions.length ? 0 : current + 1,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) =>
        current - 1 < 0 ? filteredOptions.length - 1 : current - 1,
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const contract = filteredOptions[highlightedIndex];

      if (contract) {
        selectContract(contract);
      }
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {selectedContract && !isOpen ? (
        <div className="flex items-start gap-3 rounded-md border border-border bg-surface px-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-sm font-semibold text-accent">
              {resolveContractRecordNumber(selectedContract)}
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {selectedContract.title}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              {selectedContract.contractType} · {selectedContract.companyName}
            </p>
          </div>
          <button
            type="button"
            onClick={clearSelection}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-text-secondary hover:bg-surface-muted hover:text-foreground"
          >
            Change
          </button>
        </div>
      ) : (
        <>
          <input
            ref={inputRef}
            id={id}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={isOpen}
            aria-controls={listboxId}
            aria-activedescendant={
              isOpen && filteredOptions[highlightedIndex]
                ? `${listboxId}-option-${filteredOptions[highlightedIndex].id}`
                : undefined
            }
            required={required && !value}
            autoComplete="off"
            placeholder="Search by record ID, title, counterparty, or type"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setIsOpen(true);
            }}
            onFocus={openDropdown}
            onKeyDown={handleKeyDown}
            className={inputClassName}
          />

          {isOpen ? (
            <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
              <div className="border-b border-border bg-surface-muted px-3 py-2 text-xs text-text-secondary">
                {filteredOptions.length} active parent agreement
                {filteredOptions.length === 1 ? "" : "s"}
              </div>

              {filteredOptions.length > 0 ? (
                <ul
                  id={listboxId}
                  role="listbox"
                  className="max-h-72 overflow-y-auto py-1"
                >
                  {filteredOptions.map((contract, index) => {
                    const isHighlighted = index === highlightedIndex;

                    return (
                      <li key={contract.id} role="presentation">
                        <button
                          id={`${listboxId}-option-${contract.id}`}
                          type="button"
                          role="option"
                          aria-selected={contract.id === value}
                          onMouseEnter={() => setHighlightedIndex(index)}
                          onClick={() => selectContract(contract)}
                          className={`block w-full px-4 py-3 text-left transition-colors ${
                            isHighlighted
                              ? "bg-accent/10"
                              : "hover:bg-surface-muted"
                          }`}
                        >
                          <span className="font-mono text-sm font-semibold text-accent">
                            {resolveContractRecordNumber(contract)}
                          </span>
                          <span className="mt-1 block text-sm font-medium text-foreground">
                            {contract.title}
                          </span>
                          <span className="mt-1 block text-xs text-text-muted">
                            {contract.contractType} · {contract.companyName}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="px-4 py-6 text-sm text-text-secondary">
                  No active parent agreements match your search.
                </p>
              )}
            </div>
          ) : null}
        </>
      )}

      <input type="hidden" name={id} value={value} required={required} />
    </div>
  );
}
