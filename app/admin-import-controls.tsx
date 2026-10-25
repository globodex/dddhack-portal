"use client";
import { useHydrated } from "./use-hydrated";
import { useEffect, useId, useRef, useState, type Ref } from "react";
import { rosterEmailColumns } from "../lib/roster-import-columns";
import {
  useAdminOperation,
  type AdminRow,
  type AdminRun,
} from "./admin-participant-actions";

export const approvedImportFields = [
  "email",
  "displayName",
  "bio",
  "phone",
  "sex",
  "bestDescription",
  "organization",
  "openaiOrgId",
  "linkedin",
  "github",
  "x",
  "instagram",
  "website",
] as const;
export type ImportField = (typeof approvedImportFields)[number];
export type ImportFieldMap = Partial<Record<ImportField, string>>;
export type ImportPreview = {
  digest: string;
  headers: string[];
  fieldMap: ImportFieldMap;
  emailColumns?: string[];
  counts: {
    new: number;
    existing: number;
    invalid: number;
    duplicates: number;
    prefills: number;
  };
  rows: {
    row: number;
    email: string;
    existing: boolean;
    action: string;
    website?: string;
    warnings?: string[];
  }[];
  errors?: (string | { row?: number; message?: string; code?: string })[];
};
export type ImportPreviewRequest = {
  kind: "roster";
  csv: string;
  fieldMap?: ImportFieldMap;
};

export function adminPreviewError(action: string, body: AdminRow): string {
  const messages: Record<string, string> = {
    CSV_EMPTY: "Enter valid emails or a CSV with a header row.",
    INVALID_CSV_QUOTE: "Check CSV quotes and try again.",
    CSV_COLUMN_MISMATCH: "Each CSV row must match the header columns.",
    CSV_DUPLICATE_HEADERS: "Use a unique name for each CSV column.",
    CSV_MAPPING_HEADER_MISSING: "Choose an existing CSV column.",
    CSV_MAPPING_DUPLICATE: "Use each CSV column once.",
    CSV_ROW_LIMIT: "Use at most 1,000 CSV rows.",
    CSV_TOO_LARGE: "CSV must be at most 512 KB.",
  };
  const creditMessages: Record<string, string> = {
    CREDIT_HEADING_EXISTS:
      "One of these credit headings already exists. Rename it in the CSV.",
    CREDIT_HEADING_DUPLICATE: "Use a different heading for each column.",
    CREDIT_HEADER_REQUIRED: "Add a heading to every CSV column.",
    EMPTY_CREDIT_COLUMN: "Add at least one credit to every column.",
    CSV_DUPLICATES: "Remove duplicate credits from each column.",
    CREDIT_COLUMN_LIMIT: "Use up to 20 credit columns.",
    INVALID_CREDIT_VALUE: "Keep each credit under 4,000 characters.",
  };
  const code = String(body.code || body.message || "");
  // Parser messages contain only logical row numbers and repair instructions,
  // never cell contents. Preserve them instead of hiding the actionable row.
  if (
    action === "preview-import" &&
    ["INVALID_CSV_QUOTE", "CSV_COLUMN_MISMATCH"].includes(code) &&
    typeof body.message === "string" &&
    body.message !== code
  )
    return body.message;
  return (
    (action === "preview-import" && messages[code]) ||
    (action === "preview-credit-batch" && creditMessages[code]) ||
    body.message ||
    body.code ||
    "Preview is unavailable."
  );
}

/** Preview only; commit always goes through the supplied confirmation-aware run. */
export async function previewAdminAction<T>(
  action: string,
  data: AdminRow,
): Promise<T> {
  const response = await fetch("/api/portal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ action, data }),
  });
  const body = (await response.json()) as AdminRow;
  if (!response.ok) throw new Error(adminPreviewError(action, body));
  return body as T;
}
export function importRequest(
  csv: string,
  fieldMap: ImportFieldMap,
): ImportPreviewRequest {
  if (!csv.trim()) throw new Error("Supply emails or CSV before previewing.");
  const selected = approvedImportFields.flatMap((field) =>
    fieldMap[field] ? [[field, fieldMap[field]!] as const] : [],
  );
  if (new Set(selected.map(([, header]) => header)).size !== selected.length)
    throw new Error("Map each supplied column to only one approved field.");
  return {
    kind: "roster",
    csv,
    ...(selected.length ? { fieldMap: Object.fromEntries(selected) } : {}),
  };
}
export function canCommitImport(preview: ImportPreview | null): boolean {
  return Boolean(
    preview?.digest && !preview.errors?.length && preview.counts.invalid === 0,
  );
}
function previewError(error: NonNullable<ImportPreview["errors"]>[number]) {
  return typeof error === "string"
    ? error
    : `${error.row ? `Row ${error.row}: ` : ""}${error.message || error.code || "Invalid row"}`;
}

export type ParticipantImportMode = "single" | "emails" | "csv";

export function RosterEmailColumnPicker({
  headers,
  value,
  onChange,
  inputRef,
  errorId,
}: {
  headers: readonly string[];
  value: string;
  onChange: (value: string) => void;
  inputRef?: Ref<HTMLSelectElement>;
  errorId?: string;
}) {
  const candidates = rosterEmailColumns(headers);
  if (candidates.length < 2) return null;
  return (
    <div className="admin-csv-columns">
      <label>
        Email column
        <select
          ref={inputRef}
          aria-label="Email column"
          aria-invalid={!value}
          aria-describedby={errorId}
          required
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Choose email column</option>
          {candidates.map((header) => (
            <option value={header} key={header}>
              {header}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function confirmedImportValues(
  csv: string,
  fieldMap: ImportFieldMap,
  mode: ParticipantImportMode,
  review: ImportPreview,
) {
  if (!review.digest || !review.counts || !Array.isArray(review.rows))
    throw new Error("Unable to validate participants. Try again.");
  if (!canCommitImport(review))
    throw new Error(
      review.errors?.length
        ? review.errors.slice(0, 3).map(previewError).join(" ")
        : "Fix invalid emails before adding participants.",
    );
  const additions = review.rows.filter((row) => !row.existing);
  if (
    !Number.isSafeInteger(review.counts.new) ||
    review.counts.new !== additions.length
  )
    throw new Error("Participant count changed. Try again.");
  if (review.counts.new < 1) throw new Error("No new participants to add.");
  if (mode === "single" && additions.length !== 1)
    throw new Error("Enter one email address.");
  return {
    ...importRequest(csv, fieldMap),
    digest: review.digest,
    newCount: review.counts.new,
    ...(additions.some((row) => row.website)
      ? {
          importWebsiteReview: additions
            .filter((row) => row.website)
            .map((row) => ({ row: row.row, url: row.website! })),
        }
      : {}),
    ...(mode === "single" ? { singleEmail: additions[0].email } : {}),
  };
}

export async function addParticipants(
  csv: string,
  fieldMap: ImportFieldMap,
  mode: ParticipantImportMode,
  preview: (request: ImportPreviewRequest) => Promise<ImportPreview>,
  run: AdminRun,
  onPreview?: (response: ImportPreview) => void,
) {
  const response = await preview(importRequest(csv, fieldMap));
  onPreview?.(response);
  return run(
    "commit-import",
    confirmedImportValues(csv, response.fieldMap || fieldMap, mode, response),
  );
}

export default function AdminImportControls({
  run,
  preview = (request) =>
    previewAdminAction<ImportPreview>("preview-import", request),
  initialMode = "single",
}: {
  run: AdminRun;
  preview?: (request: ImportPreviewRequest) => Promise<ImportPreview>;
  initialMode?: ParticipantImportMode;
}) {
  const hydrated = useHydrated();
  const id = useId();
  const [mode, setMode] = useState<ParticipantImportMode>(initialMode);
  const [csv, setCSV] = useState("");
  const [fieldMap, setFieldMap] = useState<ImportFieldMap>({});
  const [headers, setHeaders] = useState<string[]>([]);
  const emailColumn = useRef<HTMLSelectElement>(null);
  const { busy, error, execute, clearError } = useAdminOperation();
  useEffect(() => {
    if (!busy && headers.length > 1 && !fieldMap.email)
      emailColumn.current?.focus();
  }, [headers, fieldMap.email, busy]);
  const changeSource = (value: string) => {
    setCSV(value);
    setFieldMap({});
    setHeaders([]);
    clearError();
  };
  return (
    <section
      className="admin-control admin-import"
      aria-labelledby={`${id}-title`}
    >
      <h2 id={`${id}-title`}>Add participants</h2>
      <form
        method="post"
        inert={!hydrated}
        data-hydrated={hydrated}
        onSubmit={(event) => {
          event.preventDefault();
          void execute(async () => {
            await addParticipants(
              csv,
              fieldMap,
              mode,
              preview,
              run,
              (response) => {
                if (
                  mode === "csv" &&
                  Array.isArray(response.headers) &&
                  !response.fieldMap?.email
                ) {
                  const candidates = rosterEmailColumns(response.headers);
                  setHeaders(candidates);
                  setFieldMap(response.fieldMap || {});
                  throw new Error(
                    candidates.length > 1
                      ? "Choose the participant email column."
                      : "No email column found. Add a header containing the word Email.",
                  );
                }
              },
            );
            changeSource("");
          });
        }}
      >
        <fieldset disabled={!hydrated || busy} className="admin-import-fields">
          <div
            className="admin-source-options"
            role="group"
            aria-label="Participant source"
          >
            {(
              [
                ["single", "Single email"],
                ["emails", "Email list"],
                ["csv", "CSV"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => {
                  setMode(value);
                  changeSource("");
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="admin-import-entry">
            {mode === "single" ? (
              <label>
                <span>
                  Email{" "}
                  <span className="required-mark" aria-hidden="true">
                    *
                  </span>
                </span>
                <input
                  aria-label="Email"
                  type="email"
                  required
                  autoComplete="off"
                  value={csv}
                  onChange={(event) => changeSource(event.target.value)}
                  placeholder="name@example.com"
                />
              </label>
            ) : mode === "emails" ? (
              <label>
                <span>
                  Email list{" "}
                  <span className="required-mark" aria-hidden="true">
                    *
                  </span>
                </span>
                <textarea
                  aria-label="Email list"
                  required
                  rows={2}
                  value={csv}
                  onChange={(event) => changeSource(event.target.value)}
                  placeholder="name@example.com, another@example.com"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
            ) : (
              <div className="admin-csv-source">
                <label>
                  CSV with header row
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      void execute(async () => {
                        if (file.size > 512000) {
                          changeSource("");
                          throw new Error("CSV must be at most 512 KB.");
                        }
                        changeSource(await file.text());
                      });
                    }}
                  />
                </label>
                <textarea
                  aria-label="Paste CSV with header row"
                  rows={2}
                  value={csv}
                  onChange={(event) => changeSource(event.target.value)}
                  placeholder="Or paste CSV with header row"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            )}
            <button
              className="button"
              type="submit"
              disabled={
                busy ||
                !csv.trim() ||
                Boolean(headers.length && !fieldMap.email)
              }
            >
              {busy ? "Waiting…" : "Add"}
            </button>
          </div>
          <RosterEmailColumnPicker
            headers={headers}
            value={fieldMap.email || ""}
            inputRef={emailColumn}
            errorId={error ? `${id}-error` : undefined}
            onChange={(value) => {
              setFieldMap({ ...fieldMap, email: value });
              clearError();
            }}
          />
        </fieldset>
      </form>
      {error && (
        <p id={`${id}-error`} className="error-message" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
