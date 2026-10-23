"use client";
import { useId, useState } from "react";
import {
  AdminIcon,
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
  if (!response.ok)
    throw new Error(body.message || body.code || "Preview is unavailable.");
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

export default function AdminImportControls({
  run,
  preview = (request) =>
    previewAdminAction<ImportPreview>("preview-import", request),
}: {
  run: AdminRun;
  preview?: (request: ImportPreviewRequest) => Promise<ImportPreview>;
}) {
  const id = useId();
  const [mode, setMode] = useState<"emails" | "csv" | "single">("emails");
  const [csv, setCSV] = useState("");
  const [fieldMap, setFieldMap] = useState<ImportFieldMap>({});
  const [headers, setHeaders] = useState<string[]>([]);
  const [review, setReview] = useState<ImportPreview | null>(null);
  const [fileError, setFileError] = useState("");
  const { busy, error, execute, clearError } = useAdminOperation();
  const changeSource = (value: string) => {
    setCSV(value);
    setFieldMap({});
    setHeaders([]);
    setReview(null);
    setFileError("");
    clearError();
  };
  return (
    <section
      className="admin-control admin-import"
      aria-labelledby={`${id}-title`}
    >
      <h2 id={`${id}-title`}>
        <AdminIcon name="upload" />
        Add participants
      </h2>
      <p className="admin-control-note">
        Add-only import. Existing profiles, statuses, Going/check-in history and
        participant edits stay unchanged. Removed accounts stay removed. A
        roster addition lets an existing viewer activate with the same account.
        All social links are optional.
      </p>
      <fieldset disabled={busy}>
        <label>
          Source
          <select
            value={mode}
            onChange={(event) => {
              setMode(event.target.value as typeof mode);
              changeSource("");
            }}
          >
            <option value="emails">Pasted email list</option>
            <option value="csv">Email-only or full Luma CSV</option>
            <option value="single">One extra email</option>
          </select>
        </label>
        {mode === "single" ? (
          <label>
            Email
            <input
              type="email"
              value={csv}
              onChange={(event) => changeSource(event.target.value)}
              autoComplete="off"
            />
          </label>
        ) : (
          <label>
            {mode === "csv"
              ? "Paste CSV with its actual header row"
              : "Emails separated by lines, commas or semicolons"}
            <textarea
              rows={6}
              value={csv}
              onChange={(event) => changeSource(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        )}
        {mode === "csv" && (
          <label>
            Or choose a CSV file
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setReview(null);
                setFileError("");
                if (file.size > 512000) {
                  changeSource("");
                  setFileError("CSV must be at most 512 KB.");
                  return;
                }
                void execute(async () => changeSource(await file.text()));
              }}
            />
          </label>
        )}
        {headers.length > 0 && (
          <div className="admin-import-mapping">
            <h3>Supplied columns → approved fields</h3>
            <p className="admin-control-note">
              Choose the actual supplied header for each field. Unmapped columns
              are ignored. Values are validated by the server; no category
              values are assumed.
            </p>
            <div className="admin-control-grid">
              {approvedImportFields.map((field) => (
                <label key={field}>
                  {fieldLabels[field]}
                  <select
                    value={fieldMap[field] || ""}
                    onChange={(event) => {
                      const next = { ...fieldMap };
                      if (event.target.value) next[field] = event.target.value;
                      else delete next[field];
                      setFieldMap(next);
                      setReview(null);
                    }}
                  >
                    <option value="">
                      {field === "email"
                        ? "Choose email column"
                        : "Do not import"}
                    </option>
                    {headers.map((header) => (
                      <option
                        key={header}
                        value={header}
                        disabled={Object.entries(fieldMap).some(
                          ([other, mapped]) =>
                            other !== field && mapped === header,
                        )}
                      >
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="form-actions">
          <button
            type="button"
            className="button secondary"
            disabled={
              busy || !csv.trim() || Boolean(headers.length && !fieldMap.email)
            }
            onClick={() =>
              void execute(async () => {
                setReview(null);
                const response = await preview(importRequest(csv, fieldMap));
                if (
                  !response.digest ||
                  !Array.isArray(response.headers) ||
                  !response.counts ||
                  !Array.isArray(response.rows)
                )
                  throw new Error(
                    "The server did not return a complete import preview.",
                  );
                setHeaders(response.headers);
                setFieldMap(response.fieldMap || {});
                setReview(response);
              })
            }
          >
            {busy ? "Waiting…" : "Preview import"}
          </button>
        </div>
      </fieldset>
      {review && (
        <div className="admin-import-review" aria-live="polite">
          <h3>Import preview</h3>
          <dl className="admin-import-counts">
            {(
              [
                ["new", "New emails"],
                ["existing", "Existing, unchanged"],
                ["invalid", "Invalid rows"],
                ["duplicates", "Duplicates"],
                ["prefills", "New profile prefills"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{review.counts[key]}</dd>
              </div>
            ))}
          </dl>
          {!!review.errors?.length && (
            <div role="alert">
              <p>Resolve these issues and preview again.</p>
              <ul>
                {review.errors.map((issue, index) => (
                  <li key={index}>{previewError(issue)}</li>
                ))}
              </ul>
            </div>
          )}
          <div
            className="admin-control-table"
            role="region"
            aria-label="Import preview rows"
            tabIndex={0}
          >
            <table>
              <caption>Supplied emails and proposed actions</caption>
              <thead>
                <tr>
                  <th scope="col">Row</th>
                  <th scope="col">Email</th>
                  <th scope="col">Action</th>
                  <th scope="col">Warnings</th>
                </tr>
              </thead>
              <tbody>
                {review.rows.map((row, index) => (
                  <tr key={`${row.row}-${index}`}>
                    <td>{row.row}</td>
                    <td>{row.email}</td>
                    <td>
                      {row.existing ? "Existing · unchanged" : row.action}
                    </td>
                    <td>{row.warnings?.join("; ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="admin-control-note">
            The preview shows emails and validation only. Profile details and
            phone values are not displayed or exported here. Import requires
            confirmation.
          </p>
          <button
            className="button"
            type="button"
            disabled={
              busy ||
              !canCommitImport(review) ||
              Boolean(headers.length && !fieldMap.email)
            }
            onClick={() =>
              void execute(async () => {
                await run("commit-import", {
                  ...importRequest(csv, fieldMap),
                  digest: review.digest,
                });
                setReview(null);
              })
            }
          >
            {busy ? "Waiting…" : "Review add-only import"}
          </button>
        </div>
      )}
      {(error || fileError) && (
        <p className="error-message" role="alert">
          {fileError || error}
        </p>
      )}
    </section>
  );
}
