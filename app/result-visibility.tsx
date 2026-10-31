"use client";
import { useEffect, useId, useRef, useState } from "react";
import { CircleCheck, ChevronDown, Sparkles } from "lucide-react";
import { ActionCancelled } from "../lib/action-confirmation";
import { ist } from "../lib/time";
import { useHydrated } from "./use-hydrated";

type Row = Record<string, any>;
export type ResultsRun = (
  action: string,
  values: Row,
  options?: { errorFeedback?: "local" },
) => Promise<Row>;
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
export default function ResultVisibility({data,run}:{data:Row;run:ResultsRun}){
 const hydrated=useHydrated(),pending=useRef(false),id=useId();const [busy,setBusy]=useState(false),[error,setError]=useState(""),[preview,setPreview]=useState<Row|null>(null);
 useEffect(()=>{setPreview(null)},[data.policyVersion,data.scoreRelease?.stage]);
 if(!data.me?.owner)return null;
 const revealed=data.scoreRelease?.stage === "final",control=data.resultControls?.reveal||data.resultControls?.final,ready=control?.allowed === true;
 const unavailable=!ready&&!revealed ? control?.reason || "Scores must pass readiness checks before they can be revealed." : "";
 const act=async(confirm=false)=>{if(pending.current||!hydrated||!ready||revealed)return;pending.current=true;setBusy(true);setError("");try{
  if(confirm){await run("reveal-scores",{token:preview?.token,expiresAt:preview?.expiresAt},{errorFeedback:"local"});setPreview(null)}else{const result=await run("preview-reveal-scores",{},{errorFeedback:"local"});if(result.released)setPreview(null);else if(typeof result.token === "string"&&typeof result.expiresAt === "string")setPreview(result);else throw new Error("Readiness could not be confirmed. Reload and try again.")}
 }catch(cause){if(!(cause instanceof ActionCancelled)){setPreview(null);setError(cause instanceof Error?cause.message:"Could not reveal scores.")}}finally{pending.current=false;setBusy(false)}};
 return <section className="results-ui-visibility" aria-labelledby={`${id}-title`} aria-busy={busy}><header className="results-ui-sectionHeader"><h2 id={`${id}-title`}>Reveal scores</h2><span className="results-ui-status">{revealed?"Scores revealed":"Hidden"}</span></header><p>AI and Judge scores stay private until you reveal them. Upvotes and public comments stay visible.</p>
 {!preview&&<button id={`${id}-reveal`} type="button" className="button" disabled={!hydrated||busy||revealed||!ready} aria-describedby={unavailable?`${id}-reason`:undefined} onClick={()=>void act()}>{busy?"Checking…":revealed?"Scores revealed":"Reveal scores"}</button>}
 {preview&&<section className="results-ui-releasePreview" aria-label="Score release readiness"><strong>{preview.projects} {preview.projects===1?"project":"projects"} ready</strong><ul>{(Array.isArray(preview.warnings)?preview.warnings:[]).filter((warning:unknown)=>typeof warning === "string").map((warning:string)=><li key={warning}>{warning}</li>)}</ul><p>Readiness expires {dateLabel(preview.expiresAt)}.</p><button type="button" className="button" disabled={!hydrated||busy} onClick={()=>void act(true)}>{busy?"Revealing…":"Confirm reveal scores"}</button><button type="button" className="button secondary" disabled={busy} onClick={()=>{setPreview(null);requestAnimationFrame(()=>document.getElementById(`${id}-reveal`)?.focus())}}>Cancel</button></section>}
 {!revealed&&unavailable&&<p id={`${id}-reason`} className="results-ui-reason">{unavailable}</p>}{error&&<p role="alert" className="results-ui-error">{error}</p>}</section>;
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
  run: ResultsRun;
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
  const active =
    data.evaluationJob?.state === "running" ||
    currentRuns.some((run: Row) => ["queued", "running"].includes(run.state));
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
        : data.evaluationJob?.state === "failed_retryable"
          ? "Failed"
          : latestReport?.status === "needs_review" ||
              ["needs_review", "finalized"].includes(data.evaluationJob?.state)
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
          void run(
            "reevaluate-project",
            {
              projectId: data.project.id,
              versionId,
            },
            { errorFeedback: "local" },
          )
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
        {busy ? "Evaluating…" : grade ? "Re-evaluate" : data.evaluationJob?.state === "failed_retryable" ? "Retry evaluation" : "Run AI evaluation"}
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
