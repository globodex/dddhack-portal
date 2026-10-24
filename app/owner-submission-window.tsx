"use client";
import { automaticAuditReason } from "../lib/audit-contract";
import { useId, useState } from "react";
import {
  AdminIcon,
  useAdminOperation,
  type AdminRun,
} from "./admin-participant-actions";
import { previewAdminAction } from "./admin-import-controls";

const IST_OFFSET_MS = 330 * 60 * 1000;
/** Strict calendar parsing: never interpreted in the browser's local timezone. */
export function istInputToUTC(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Use a complete IST date and time.");
  const [, year, month, day, hour, minute] = match.map(Number);
  if (
    year < 1000 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59
  )
    throw new Error("Enter a valid IST date and time.");
  const local = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (
    local.getUTCFullYear() !== year ||
    local.getUTCMonth() !== month - 1 ||
    local.getUTCDate() !== day
  )
    throw new Error("Enter a valid calendar date.");
  return new Date(local.getTime() - IST_OFFSET_MS).toISOString();
}
export function utcToISTInput(value: string): string {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new Error(
      "The submission window must include an explicit UTC offset.",
    );
  istInputToUTC(value.slice(0, 16));
  return new Date(Date.parse(value) + IST_OFFSET_MS).toISOString().slice(0, 16);
}
export function submissionWindowValues(openInput: string, closeInput: string) {
  const open = istInputToUTC(openInput),
    close = istInputToUTC(closeInput);
  if (Date.parse(open) >= Date.parse(close))
    throw new Error("Opening must be before closing.");
  return { open, close };
}
export type SubmissionWindowPreview = {
  token: string;
  version: number;
  open: string;
  close: string;
  openIST: string;
  closeIST: string;
  warnings: string[];
};
export function submissionWindowPublishValues(
  review: SubmissionWindowPreview,
  reason = automaticAuditReason,
) {
  if (!review.token || !Number.isInteger(review.version))
    throw new Error("A current preview is required.");
  if (
    !Number.isFinite(Date.parse(review.open)) ||
    !Number.isFinite(Date.parse(review.close)) ||
    Date.parse(review.open) >= Date.parse(review.close)
  )
    throw new Error("The preview contains an invalid window.");
  return {
    open: review.open,
    close: review.close,
    token: review.token,
    version: review.version,
    reason: reason.trim() || automaticAuditReason,
    confirmation: "CHANGE_SUBMISSION_WINDOW",
  };
}
function inputOrEmpty(value: string) {
  try {
    return utcToISTInput(value);
  } catch {
    return "";
  }
}
export default function OwnerSubmissionWindow({
  owner,
  open,
  close,
  run,
  preview = (values) =>
    previewAdminAction<SubmissionWindowPreview>(
      "preview-submission-window",
      values,
    ),
}: {
  owner: boolean;
  open: string;
  close: string;
  run: AdminRun;
  preview?: (values: {
    open: string;
    close: string;
  }) => Promise<SubmissionWindowPreview>;
}) {
  const id = useId();
  const [openInput, setOpen] = useState(() => inputOrEmpty(open)),
    [closeInput, setClose] = useState(() => inputOrEmpty(close)),
    [review, setReview] = useState<SubmissionWindowPreview | null>(null),
    [touched, setTouched] = useState({ open: false, close: false });
  const { busy, error, execute, clearError } = useAdminOperation();
  if (!owner) return null;
  let converted: { open: string; close: string } | null = null,
    validation = "";
  try {
    converted = submissionWindowValues(openInput, closeInput);
  } catch (cause) {
    validation = (cause as Error).message;
  }
  const showValidation = !!validation && (touched.open || touched.close);
  return (
    <section
      className="admin-control admin-window admin-settings-section"
      aria-labelledby={`${id}-title`}
    >
      <header>
        <h2 id={`${id}-title`}>Submission window</h2>
        <span className="admin-timezone">IST</span>
      </header>
      <fieldset disabled={busy}>
        <div className="admin-control-grid">
          <label>
            <span>
              Opens (IST){" "}
              <span className="required-mark" aria-hidden="true">
                *
              </span>
            </span>
            <input
              type="datetime-local"
              step="60"
              required
              value={openInput}
              aria-invalid={showValidation || undefined}
              aria-describedby={showValidation ? `${id}-validation` : undefined}
              onBlur={() =>
                setTouched((current) => ({ ...current, open: true }))
              }
              onChange={(event) => {
                setOpen(event.target.value);
                setReview(null);
                clearError();
              }}
            />
          </label>
          <label>
            <span>
              Closes (IST){" "}
              <span className="required-mark" aria-hidden="true">
                *
              </span>
            </span>
            <input
              type="datetime-local"
              step="60"
              required
              value={closeInput}
              aria-invalid={showValidation || undefined}
              aria-describedby={showValidation ? `${id}-validation` : undefined}
              onBlur={() =>
                setTouched((current) => ({ ...current, close: true }))
              }
              onChange={(event) => {
                setClose(event.target.value);
                setReview(null);
                clearError();
              }}
            />
          </label>
        </div>
        {showValidation && (
          <p id={`${id}-validation`} className="error-message" role="status">
            {validation}
          </p>
        )}
        {review && review.warnings.length > 0 && (
          <ul className="admin-window-warnings" role="status">
            {review.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        )}
        <div className="admin-window-footer">
          <span>Three committed submissions</span>
          <button
            type="button"
            className="button"
            disabled={busy || !converted}
            onClick={() =>
              void execute(async () => {
                if (review) {
                  await run(
                    "publish-submission-window",
                    submissionWindowPublishValues(review),
                  );
                  setReview(null);
                  return;
                }
                const values = submissionWindowValues(openInput, closeInput),
                  response = await preview(values);
                if (
                  !response.token ||
                  !Number.isInteger(response.version) ||
                  !Array.isArray(response.warnings)
                )
                  throw new Error(
                    "The server did not return a complete versioned window preview.",
                  );
                if (
                  Date.parse(response.open) !== Date.parse(values.open) ||
                  Date.parse(response.close) !== Date.parse(values.close)
                )
                  throw new Error(
                    "The preview differs from the requested dates. Reload and try again.",
                  );
                if (response.warnings.length) {
                  setReview(response);
                  return;
                }
                await run(
                  "publish-submission-window",
                  submissionWindowPublishValues(response),
                );
              })
            }
          >
            <AdminIcon name="clock" />
            {busy ? "Waiting…" : "Publish"}
          </button>
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
    </section>
  );
}
