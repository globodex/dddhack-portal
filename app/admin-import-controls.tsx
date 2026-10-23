"use client";
import { useId, useState } from "react";
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
    warnings?: string[];
  }[];
  errors?: (string | { row?: number; message?: string; code?: string })[];
};
export type ImportPreviewRequest = {
  kind: "roster";
  csv: string;
  fieldMap?: ImportFieldMap;
};
const fieldLabels: Record<ImportField, string> = {
  email: "Email (required)",
  displayName: "Full name",
  bio: "One-line bio",
  phone: "Phone",
  sex: "Sex",
  bestDescription: "Best description",
  organization: "Organization",
  openaiOrgId: "OpenAI organization ID",
  linkedin: "LinkedIn",
  github: "GitHub",
  x: "X",
  instagram: "Instagram",
  website: "Website",
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
  const code = String(body.code || body.message || "");
  return (
    (action === "preview-import" && messages[code]) ||
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
  const id = useId();
  const [mode, setMode] = useState<ParticipantImportMode>(initialMode);
  const [csv, setCSV] = useState("");
  const [fieldMap, setFieldMap] = useState<ImportFieldMap>({});
  const [headers, setHeaders] = useState<string[]>([]);
  const { busy, error, execute, clearError } = useAdminOperation();
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
                  setHeaders(response.headers);
                  setFieldMap(response.fieldMap || {});
                  throw new Error("Choose the email column.");
                }
              },
            );
            changeSource("");
          });
        }}
      >
        <fieldset disabled={busy}>
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
                Email
                <input
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
                Email list
                <textarea
                  required
                  rows={3}
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
                  rows={3}
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
          {headers.length > 0 && (
            <div className="admin-csv-columns">
              {headers.map((header) => {
                const selected =
                  approvedImportFields.find(
                    (field) => fieldMap[field] === header,
                  ) || "";
                return (
                  <label key={header}>
                    {header}
                    <select
                      value={selected}
                      onChange={(event) => {
                        const next = { ...fieldMap };
                        for (const field of approvedImportFields)
                          if (next[field] === header) delete next[field];
                        if (event.target.value)
                          next[event.target.value as ImportField] = header;
                        setFieldMap(next);
                        clearError();
                      }}
                    >
                      <option value="">Ignore column</option>
                      {approvedImportFields.map((field) => (
                        <option
                          value={field}
                          key={field}
                          disabled={Boolean(
                            fieldMap[field] && fieldMap[field] !== header,
                          )}
                        >
                          {fieldLabels[field]}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>
      </form>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
