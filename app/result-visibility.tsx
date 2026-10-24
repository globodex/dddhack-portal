"use client";
import { useId, useRef, useState } from "react";
import { CircleCheck, ChevronDown, Sparkles } from "lucide-react";
import { ActionCancelled } from "../lib/action-confirmation";
import { ist } from "../lib/time";
import { useHydrated } from "./use-hydrated";
import type { AdminRun } from "./admin-participant-actions";
type Row = Record<string, any>;
const dateLabel = (value: unknown) => {
  try {
    return typeof value === "string" ? ist(value) : "";
  } catch {
    return "";
  }
};
export function currentResultSnapshots(data: Row) {
  const snapshots: Row[] = Array.isArray(data.resultSnapshots)
    ? data.resultSnapshots
    : [];
  const known = snapshots.filter(
    (snapshot) => snapshot.policy_version === data.policyVersion,
  );
  return known.length
    ? known
    : snapshots.length === 1 && data.resultControls?.final?.allowed === true
      ? snapshots
      : [];
}
export default function ResultVisibility({
  data,
  run,
}: {
  data: Row;
  run: AdminRun;
}) {
  const hydrated = useHydrated(),
    id = useId(),
    pending = useRef(false);
  const [busy, setBusy] = useState(""),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [snapshotId, setSnapshotId] = useState("");
  if (!data.me?.owner && data.me?.role !== "admin") return null;
  const stage = data.scoreRelease?.stage || "community",
    snapshots = currentResultSnapshots(data);
  const selected = snapshots.length === 1 ? snapshots[0].id : snapshotId;
  const control = (key: string) =>
    data.resultControls?.[key] || {
      allowed: false,
      reason: "Reload result controls.",
    };
  const snapshotsExist = (data.resultSnapshots || []).length > 0;
  const action = async (key: string, command: string, values: Row) => {
    if (!hydrated || pending.current) return;
    pending.current = true;
    setBusy(key);
    setErrors((current) => ({ ...current, [key]: "" }));
    try {
      await run(command, values);
    } catch (error) {
      if (!(error instanceof ActionCancelled))
        setErrors((current) => ({
          ...current,
          [key]: error instanceof Error ? error.message : "The action failed.",
        }));
    } finally {
      pending.current = false;
      setBusy("");
    }
  };
  const reason = (key: string) =>
    errors[key] ||
    (!control(key).allowed
      ? control(key).reason
      : key === "final" && !selected
        ? snapshots.length
          ? "Choose a frozen snapshot."
          : "Reload the frozen snapshot details."
        : "");
  return (
    <section
      className={"results-ui-visibility"}
      data-results-visibility="true"
      data-hydrated={hydrated}
      aria-labelledby={`${id}-title`}
      aria-busy={!!busy}
    >
      <header className={"results-ui-sectionHeader"}>
        <h2 id={`${id}-title`}>Results visibility</h2>
        <span className={"results-ui-status"}>
          {stage === "final"
            ? "Final stage"
            : stage === "ai"
              ? "AI scores public"
              : "Hidden"}
        </span>
      </header>
      <ol className={"results-ui-steps"}>
        <li>
          <span className={"results-ui-stepNumber"}>1</span>
          <div className={"results-ui-stepBody"}>
            <h3>AI scores</h3>
            {stage === "ai" || data.scoreRelease?.aiRevealed === true ? (
              <p className={"results-ui-completed"}>
                <CircleCheck size={17} aria-hidden="true" />
                AI scores revealed
              </p>
            ) : stage === "final" ? (
              <p className="results-ui-reason">
                {data.scoreRelease?.aiRevealed === false
                  ? "AI scores were not revealed."
                  : "Final stage active."}
              </p>
            ) : (
              <>
                <button
                  type="button"
                  className="button"
                  disabled={!hydrated || !!busy || !control("ai").allowed}
                  aria-describedby={
                    reason("ai") ? `${id}-ai-reason` : undefined
                  }
                  onClick={() => void action("ai", "reveal-ai-scores", {})}
                >
                  {busy === "ai" ? "Revealing…" : "Reveal AI scores"}
                </button>
                {reason("ai") && (
                  <p
                    id={`${id}-ai-reason`}
                    className={
                      errors.ai ? "results-ui-error" : "results-ui-reason"
                    }
                    role={errors.ai ? "alert" : undefined}
                  >
                    {reason("ai")}
                  </p>
                )}
              </>
            )}
          </div>
        </li>
        <li>
          <span className={"results-ui-stepNumber"}>2</span>
          <div className={"results-ui-stepBody"}>
            <h3>Final snapshot</h3>
            {snapshotsExist ? (
              <div className={"results-ui-snapshot"}>
                <span className={"results-ui-completed"}>
                  <CircleCheck size={17} aria-hidden="true" />
                  Frozen
                </span>
                {(data.resultSnapshots as Row[]).map((snapshot) => (
                  <p key={snapshot.id}>
                    {dateLabel(snapshot.created_at)}
                    {Number.isInteger(snapshot.eligibleCount)
                      ? ` · ${snapshot.eligibleCount} eligible projects`
                      : Number.isInteger(snapshot.entryCount)
                        ? ` · ${snapshot.entryCount} projects`
                        : ""}
                  </p>
                ))}
              </div>
            ) : (
              <>
                {data.me?.owner && (
                  <button
                    type="button"
                    className="button"
                    disabled={!hydrated || !!busy || !control("freeze").allowed}
                    aria-describedby={
                      reason("freeze") ? `${id}-freeze-reason` : undefined
                    }
                    onClick={() => void action("freeze", "freeze-results", {})}
                  >
                    {busy === "freeze" ? "Freezing…" : "Freeze final scores"}
                  </button>
                )}
                {reason("freeze") && (
                  <p
                    id={`${id}-freeze-reason`}
                    className={
                      errors.freeze ? "results-ui-error" : "results-ui-reason"
                    }
                    role={errors.freeze ? "alert" : undefined}
                  >
                    {reason("freeze")}
                  </p>
                )}
              </>
            )}
          </div>
        </li>
        <li>
          <span className={"results-ui-stepNumber"}>3</span>
          <div className={"results-ui-stepBody"}>
            <h3>Final results</h3>
            {stage === "final" ? (
              <p className={"results-ui-completed"}>
                <CircleCheck size={17} aria-hidden="true" />
                {data.scoreRelease?.complete
                  ? "All awards unveiled"
                  : "Manual award reveal active"}
              </p>
            ) : (
              <>
                {snapshots.length > 1 && (
                  <label className={"results-ui-field"}>
                    <span>Frozen snapshot</span>
                    <select
                      value={snapshotId}
                      onChange={(event) => setSnapshotId(event.target.value)}
                    >
                      <option value="">Choose a frozen snapshot</option>
                      {snapshots.map((snapshot) => (
                        <option key={snapshot.id} value={snapshot.id}>
                          {dateLabel(snapshot.created_at)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button
                  type="button"
                  className="button"
                  disabled={
                    !hydrated ||
                    !!busy ||
                    !control("final").allowed ||
                    !selected
                  }
                  aria-describedby={
                    reason("final") ? `${id}-final-reason` : undefined
                  }
                  onClick={() =>
                    void action("final", "reveal-final-scores", {
                      snapshotId: selected,
                    })
                  }
                >
                  {busy === "final" ? "Revealing…" : "Reveal final scores"}
                </button>
                {reason("final") && (
                  <p
                    id={`${id}-final-reason`}
                    className={
                      errors.final ? "results-ui-error" : "results-ui-reason"
                    }
                    role={errors.final ? "alert" : undefined}
                  >
                    {reason("final")}
                  </p>
                )}
              </>
            )}
          </div>
        </li>
      </ol>
      {stage === "final" && data.scoreRelease?.remainingAwards?.length > 0 && (
        <section className={"results-ui-awards"}>
          <h3>Unveil an award</h3>
          <div>
            {data.scoreRelease.remainingAwards.map((award: Row) => (
              <button
                type="button"
                className="button secondary"
                key={award.position}
                disabled={!hydrated || !!busy || !data.scoreRelease.releaseId}
                onClick={() =>
                  void action("award", "unveil-winner", {
                    releaseId: data.scoreRelease.releaseId,
                    position: award.position,
                  })
                }
              >
                Award {award.position}
              </button>
            ))}
          </div>
          {errors.award && (
            <p className={"results-ui-error"} role="alert">
              {errors.award}
            </p>
          )}
        </section>
      )}
    </section>
  );
}

const dimensions = [
  ["functionality", "Functionality", 6],
  ["complexity", "Complexity", 5],
  ["openai", "OpenAI", 4],
  ["cerebras", "Cerebras", 2],
  ["ux", "User experience", 3],
  ["docs", "Documentation", 2],
  ["contributors", "Contributors", 2],
  ["deployment", "Deployment", 2],
  ["readiness", "Readiness", 3],
  ["seo", "SEO", 1],
] as const;
export function PrivateAIEvaluation({
  data,
  run,
}: {
  data: Row;
  run: AdminRun;
}) {
  const hydrated = useHydrated(),
    pending = useRef(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!data.me?.owner && data.me?.role !== "admin") return null;
  const versionId = data.version?.id;
  const currentRuns = (data.runs || []).filter(
    (run: Row) => run.version_id === versionId,
  );
  const active = currentRuns.some((run: Row) =>
    ["queued", "running"].includes(run.state),
  );
  const grade =
    data.evaluation?.report?.versionId === versionId &&
    Number.isFinite(data.evaluation?.score)
      ? data.evaluation
      : null;
  const latestReport = grade?.report || data.evaluationReport;
  const control = data.evaluationControl;
  const unavailable =
    data.selectedIsCurrent === false
      ? "Viewing a previous submission. Select the current version to evaluate."
      : control?.allowed === false
        ? control.reason
        : data.resultsFrozen
          ? "Final scores are frozen."
          : !data.evaluationConfigured
            ? data.evaluationUnavailableReason ||
              "AI evaluation is not configured."
            : !versionId
              ? "A committed version is required."
              : active
                ? "An evaluation is already running."
                : "";
  const status =
    busy || active
      ? "Running"
      : grade
        ? "Scored"
        : latestReport?.status === "needs_review"
          ? "Review needed"
          : data.evaluationConfigured
            ? "Ready"
            : "Not configured";
  return (
    <section
      className={`${"results-ui-card"} ${"results-ui-ai"}`}
      aria-busy={busy || active}
      data-private-ai="true"
    >
      <header className={"results-ui-sectionHeader"}>
        <h2>
          <Sparkles size={18} aria-hidden="true" />
          AI evaluation
        </h2>
        <span className={"results-ui-status"}>{status}</span>
      </header>
      {grade && (
        <p className={"results-ui-grade"}>
          <strong>{grade.score}</strong>
          <span>/ 30</span>
        </p>
      )}
      {unavailable && <p className={"results-ui-reason"}>{unavailable}</p>}
      {data.evaluationJob && (
        <p className={"results-ui-meta"}>
          {data.evaluationJob.attempts} / {data.evaluationJob.maxAttempts ?? 3}{" "}
          evaluation attempts
        </p>
      )}
      <button
        type="button"
        className="button secondary"
        disabled={
          !hydrated || busy || !!unavailable || control?.allowed === false
        }
        onClick={() => {
          if (pending.current || !hydrated) return;
          pending.current = true;
          setBusy(true);
          setError("");
          void run("reevaluate-project", {
            projectId: data.project.id,
            versionId,
          })
            .catch((cause) => {
              if (!(cause instanceof ActionCancelled))
                setError(
                  cause instanceof Error ? cause.message : "Evaluation failed.",
                );
            })
            .finally(() => {
              pending.current = false;
              setBusy(false);
            });
        }}
      >
        {busy ? "Evaluating…" : grade ? "Re-evaluate" : "Run AI evaluation"}
      </button>
      {error && (
        <p className={"results-ui-error"} role="alert">
          {error}
        </p>
      )}
      {latestReport && (
        <details className={"results-ui-report"}>
          <summary>
            Private assessment
            <ChevronDown size={17} aria-hidden="true" />
          </summary>
          {latestReport.dimensions && (
            <dl className={"results-ui-dimensions"}>
              {dimensions.map(([key, label, max]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>
                    {latestReport.dimensions[key]} / {max}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {(latestReport.checks || [])
            .filter((check: Row) => check.id !== "approved-snapshot")
            .map((check: Row) => (
              <article key={check.id}>
                <strong>
                  {String(check.id)
                    .replace(/^ai-evidence:/, "")
                    .replaceAll("-", " ")}
                </strong>
                <p>{check.explanation}</p>
                {check.evidence?.length > 0 && (
                  <small>{check.evidence.join(" · ")}</small>
                )}
              </article>
            ))}
        </details>
      )}
    </section>
  );
}
