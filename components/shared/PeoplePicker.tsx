"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDeferredEffect } from "@/lib/use-deferred-effect";
import {
  formatPersonSubtitle,
  getPersonInitials,
  isValidEmail,
  nameFromEmail,
} from "@/lib/person-display";

export type PeoplePickerValue = {
  email: string;
  name: string;
  jobTitle?: string;
  department?: string;
};

interface DirectorySearchResult {
  id: string;
  email: string;
  displayName: string;
  jobTitle: string | null;
  department: string | null;
  phone: string | null;
}

interface PeoplePickerProps {
  value: { email: string; name: string } | null;
  onChange: (user: PeoplePickerValue | null) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  label?: string;
  helpText?: string;
  error?: string;
}

function toPickerValue(result: DirectorySearchResult): PeoplePickerValue {
  return {
    email: result.email,
    name: result.displayName,
    jobTitle: result.jobTitle ?? undefined,
    department: result.department ?? undefined,
  };
}

function PersonAvatar({
  name,
  size = "md",
}: {
  name: string;
  size?: "sm" | "md";
}) {
  const sizeClass = size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-700 ${sizeClass}`}
    >
      {getPersonInitials(name)}
    </div>
  );
}

function SearchSkeletonRows() {
  return (
    <div className="space-y-2 p-2">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={`people-picker-skeleton-${index}`}
          className="flex animate-pulse items-center gap-3 rounded-md px-2 py-2"
        >
          <div className="h-8 w-8 rounded-full bg-gray-200" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-32 rounded bg-gray-200" />
            <div className="h-3 w-40 rounded bg-gray-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PeoplePicker({
  value,
  onChange,
  placeholder = "Search by name or email...",
  required = false,
  disabled = false,
  label,
  helpText,
  error,
}: PeoplePickerProps) {
  const inputId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectorySearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [selectedMeta, setSelectedMeta] = useState<{
    jobTitle?: string;
    department?: string;
  } | null>(null);

  const selectedSubtitle = useMemo(
    () =>
      formatPersonSubtitle(
        selectedMeta?.jobTitle,
        selectedMeta?.department,
      ),
    [selectedMeta],
  );

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setHighlightedIndex(-1);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent): void {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        closeDropdown();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [closeDropdown, isOpen]);

  useDeferredEffect(() => {
    if (disabled || value) {
      setResults([]);
      setIsLoading(false);
      setSearchError(null);
      return;
    }

    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 2) {
      setResults([]);
      setIsLoading(false);
      setSearchError(null);
      setHighlightedIndex(-1);
      return;
    }

    setIsLoading(true);
    setSearchError(null);

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(
            `/api/directory/search?q=${encodeURIComponent(trimmedQuery)}&limit=8`,
            { cache: "no-store" },
          );

          if (!response.ok) {
            throw new Error("Search failed");
          }

          const data = (await response.json()) as DirectorySearchResult[];
          setResults(data);
          setHighlightedIndex(data.length > 0 ? 0 : -1);
        } catch {
          setResults([]);
          setSearchError("Unable to search directory users.");
          setHighlightedIndex(-1);
        } finally {
          setIsLoading(false);
        }
      })();
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [disabled, query, value]);

  function selectUser(user: PeoplePickerValue, meta?: DirectorySearchResult): void {
    onChange(user);
    setSelectedMeta(
      meta
        ? {
            jobTitle: meta.jobTitle ?? undefined,
            department: meta.department ?? undefined,
          }
        : {
            jobTitle: user.jobTitle,
            department: user.department,
          },
    );
    setQuery("");
    setResults([]);
    closeDropdown();
  }

  function handleManualEmailEntry(email: string): void {
    const trimmedEmail = email.trim();

    if (!isValidEmail(trimmedEmail)) {
      return;
    }

    selectUser({
      email: trimmedEmail,
      name: nameFromEmail(trimmedEmail),
    });
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      closeDropdown();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      }
      setHighlightedIndex((current) =>
        results.length === 0
          ? -1
          : Math.min(current + 1, results.length - 1),
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) =>
        results.length === 0 ? -1 : Math.max(current - 1, 0),
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();

      if (
        highlightedIndex >= 0 &&
        highlightedIndex < results.length &&
        results[highlightedIndex]
      ) {
        selectUser(toPickerValue(results[highlightedIndex]), results[highlightedIndex]);
        return;
      }

      handleManualEmailEntry(query);
    }
  }

  function handleClear(): void {
    onChange(null);
    setSelectedMeta(null);
    setQuery("");
    setResults([]);
    closeDropdown();
  }

  return (
    <div ref={containerRef} className="relative">
      {label ? (
        <label
          htmlFor={inputId}
          className="mb-1 block text-sm font-medium text-gray-900"
        >
          {label}
          {required ? <span className="text-rose-600"> *</span> : null}
        </label>
      ) : null}

      {value ? (
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
          <PersonAvatar name={value.name} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900">{value.name}</p>
            <p className="text-xs text-gray-500">{value.email}</p>
            {selectedSubtitle ? (
              <p className="text-xs text-gray-400">{selectedSubtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            aria-label="Clear selected person"
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-60"
          >
            ×
          </button>
        </div>
      ) : (
        <>
          <input
            id={inputId}
            type="text"
            value={query}
            disabled={disabled}
            required={required}
            placeholder={placeholder}
            onChange={(event) => {
              setQuery(event.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleInputKeyDown}
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-50"
            autoComplete="off"
          />

          {isOpen && query.trim().length >= 2 ? (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
              {isLoading ? <SearchSkeletonRows /> : null}

              {!isLoading && searchError ? (
                <p className="px-3 py-3 text-sm text-gray-500">{searchError}</p>
              ) : null}

              {!isLoading && !searchError && results.length > 0 ? (
                <ul className="max-h-72 overflow-y-auto py-1">
                  {results.map((result, index) => {
                    const subtitle = formatPersonSubtitle(
                      result.jobTitle,
                      result.department,
                    );

                    return (
                      <li key={result.id}>
                        <button
                          type="button"
                          onMouseEnter={() => setHighlightedIndex(index)}
                          onClick={() =>
                            selectUser(toPickerValue(result), result)
                          }
                          className={`flex w-full items-center gap-3 px-3 py-2 text-left ${
                            highlightedIndex === index
                              ? "bg-blue-50"
                              : "hover:bg-gray-50"
                          }`}
                        >
                          <PersonAvatar name={result.displayName} size="sm" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900">
                              {result.displayName}
                            </p>
                            <p className="text-xs text-gray-500">
                              {result.email}
                            </p>
                            {subtitle ? (
                              <p className="text-xs text-gray-400">
                                {subtitle}
                              </p>
                            ) : null}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              {!isLoading &&
              !searchError &&
              results.length === 0 &&
              query.trim().length >= 2 ? (
                <div className="px-3 py-3">
                  <p className="text-sm text-gray-600">
                    No users found for &apos;{query.trim()}&apos;
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    You can also type an email address directly
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {helpText ? (
        <p className="mt-1 text-xs text-gray-500">{helpText}</p>
      ) : null}
      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
