import { automaticAuditReason } from "../lib/audit-contract";
("use client");
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
  const [openInput, setOpen] = useState(() => inputOrEmpty(open));
  const [closeInput, setClose] = useState(() => inputOrEmpty(close));
  const [review, setReview] = useState<SubmissionWindowPreview | null>(null);
  const { busy, error, execute, clearError } = useAdminOperation();
  if (!owner) return null;
  let converted: { open: string; close: string } | null = null;
  let validation = "";
  try {
    converted = submissionWindowValues(openInput, closeInput);
  } catch (cause) {
    validation = (cause as Error).message;
  }
  const invalidate = () => {
    setReview(null);
    clearError();
  };
  return (
    <section
      className="admin-control admin-window"
      aria-labelledby={`${id}-title`}
    >
      <h2 id={`${id}-title`}>
        <AdminIcon name="clock" />
        Submission window
      </h2>

      <fieldset disabled={busy}>
        <div className="admin-control-grid">
          <label>
            Opening · IST
            <input
              type="datetime-local"
              step="60"
              required
              value={openInput}
              onChange={(event) => {
                setOpen(event.target.value);
                invalidate();
              }}
            />
          </label>
          <label>
            Closing · IST
            <input
              type="datetime-local"
              step="60"
              required
              value={closeInput}
              onChange={(event) => {
                setClose(event.target.value);
                invalidate();
              }}
            />
          </label>
        </div>
        {converted && (
          <dl className="admin-window-dates">
            <dt>Proposed opening</dt>
            <dd>
              <time dateTime={converted.open}>
                {openInput.replace("T", " ")} IST (UTC+05:30)
              </time>
              <br />
              <code>{converted.open}</code>
            </dd>
            <dt>Proposed closing</dt>
            <dd>
              <time dateTime={converted.close}>
                {closeInput.replace("T", " ")} IST (UTC+05:30)
              </time>
              <br />
              <code>{converted.close}</code>
            </dd>
          </dl>
        )}
        {validation && (
          <p className="admin-control-note" role="status">
            {validation}
          </p>
        )}
        <button
          type="button"
          className="button secondary"
          disabled={busy || !converted}
          onClick={() =>
            void execute(async () => {
              setReview(null);
              const values = submissionWindowValues(openInput, closeInput);
              const response = await preview(values);
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
                  "The preview differs from the requested dates. Reload and preview again.",
                );
              setReview(response);
            })
          }
        >
          {busy ? "Waiting…" : "Preview both dates"}
        </button>
      </fieldset>
      {review && (
        <form
          className="admin-window-review"
          onSubmit={(event) => {
            event.preventDefault();
            void execute(async () => {
              await run(
                "publish-submission-window",
                submissionWindowPublishValues(review),
              );
              setReview(null);
            });
          }}
        >
          <h3>Server preview · current version {review.version}</h3>
          <dl className="admin-window-dates">
            <dt>Opening</dt>
            <dd>
              {review.openIST}
              <br />
              <code>{review.open}</code>
            </dd>
            <dt>Closing</dt>
            <dd>
              {review.closeIST}
              <br />
              <code>{review.close}</code>
            </dd>
          </dl>
          {!!review.warnings.length && (
            <ul>
              {review.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          )}
          <fieldset disabled={busy}>
            <button className="button" type="submit" disabled={busy}>
              {busy ? "Waiting…" : "Review and publish both dates"}
            </button>
          </fieldset>
        </form>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
    </section>
  );
}
