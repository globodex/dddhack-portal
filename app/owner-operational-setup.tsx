"use client";
import { useState } from "react";
import { ActionCancelled } from "../lib/action-confirmation";
import {
  indefiniteRetentionNotice,
  operationalSetupRequest,
  operationalSetupSave,
  type SetupOperation,
  type OperationalSetupRequest,
} from "../lib/operational-setup-contract";
import { ist } from "../lib/time";
type Preview = {
  token: string;
  version: number;
  operation: string;
  retentionNotice: string;
  openIST?: string;
  closeIST?: string;
  deploymentRule?: string;
  attendanceRule?: string;
  enablesOperations: false;
  scoringPolicyChanged: false;
};
async function requestPreview(
  values: OperationalSetupRequest,
): Promise<Preview> {
  const r = await fetch("/api/portal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ action: "preview-operational-setup", data: values }),
  });
  const body = (await r.json()) as Preview & { message?: string };
  if (!r.ok) throw new Error(body.message || "Setup preview failed.");
  return body;
}
export default function OwnerOperationalSetup({
  owner,
  version,
  open,
  close,
  run,
  preview = requestPreview,
}: {
  owner: boolean;
  version: number;
  open: string;
  close: string | null;
  run: (
    action: string,
    values: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  preview?: (values: OperationalSetupRequest) => Promise<Preview>;
}) {
  const [operation, setOperation] = useState<SetupOperation>("submissions"),
    [privacy, setPrivacy] = useState(false),
    [rules, setRules] = useState(false),
    [review, setReview] = useState<{
      request: OperationalSetupRequest;
      preview: Preview;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!owner) return null;
  const invalidate = () => {
    setReview(null);
    setError("");
  };
  return (
    <section className="panel" aria-labelledby="operational-setup-title">
      <h2 id="operational-setup-title">Operational setup</h2>

      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          setReview(null);
          try {
            const request = operationalSetupRequest({
              version,
              operation,
              privacyConfirmed: privacy,
              rulesConfirmed: rules,
            });
            const result = await preview(request);
            if (
              result.version !== version ||
              result.operation !== operation ||
              result.enablesOperations !== false ||
              result.scoringPolicyChanged !== false
            )
              throw new Error("Reload the current setup before continuing.");
            setReview({ request, preview: result });
          } catch (cause) {
            setError((cause as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <label>
            Operation
            <select
              name="operation"
              value={operation}
              onChange={(e) => {
                setOperation(e.target.value as SetupOperation);
                setRules(false);
                invalidate();
              }}
            >
              <option value="submissions">Submissions</option>
              <option value="checkin">Check-in</option>
            </select>
          </label>
          {operation === "submissions" ? (
            <ul>
              <li>
                Submission window: {open ? ist(open) : "Not configured"} to{" "}
                {close ? ist(close) : "Not configured"}. Edit both dates in
                Submission window below.
              </li>
              <li>
                Deployment link is optional. Only the personally checked-in
                leader can submit, with at most three committed versions.
              </li>
              <li>
                Repository creation and first commit must both be strictly after
                1 November2026,08:00IST. Changing the submission window does not
                change this rule.
              </li>
            </ul>
          ) : (
            <p>
              Individual portal Going approval is required for check-in. Luma is
              registration only. Attendance and personal credits stay
              individually scoped.
            </p>
          )}
          <label>
            <input
              type="checkbox"
              name="rulesConfirmed"
              checked={rules}
              required
              onChange={(e) => {
                setRules(e.target.checked);
                invalidate();
              }}
            />
            I confirm these{" "}
            {operation === "submissions" ? "submission" : "check-in"} rules.
          </label>
          <blockquote>{indefiniteRetentionNotice}</blockquote>
          <label>
            <input
              type="checkbox"
              name="privacyConfirmed"
              checked={privacy}
              required
              onChange={(e) => {
                setPrivacy(e.target.checked);
                invalidate();
              }}
            />
            I confirm indefinite retention and the private-field protections
            above.
          </label>
          <button
            className="button secondary"
            disabled={busy || !privacy || !rules}
          >
            {busy ? "Preparing…" : "Preview operational setup"}
          </button>
        </fieldset>
      </form>
      {review && (
        <div className="policy-preview" role="status">
          <h3>
            Preview · {operation === "submissions" ? "Submissions" : "Check-in"}
          </h3>
          <p>
            {review.preview.openIST
              ? `${review.preview.openIST} – ${review.preview.closeIST}`
              : review.preview.attendanceRule}
          </p>
          <p>{review.preview.retentionNotice}</p>

          <div className="form-actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => setReview(null)}
            >
              Discard preview
            </button>
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={async () => {
                if (busy) return;
                setBusy(true);
                setError("");
                try {
                  await run(
                    "save-operational-setup",
                    operationalSetupSave(review.request, review.preview),
                  );
                  setReview(null);
                } catch (cause) {
                  if (!(cause instanceof ActionCancelled))
                    setError((cause as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Review and save confirmations
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
