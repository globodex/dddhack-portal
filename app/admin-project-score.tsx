import { ChevronDown } from "lucide-react";
import type { AdminProjectScoreDTO } from "../lib/admin-submission-analytics";

const numbers = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const componentStatus = (key: string, status: string) => {
  if (status === "awaiting")
    return ["ai", "astra"].includes(key) ? "Not evaluated" : "Awaiting score";
  return (
    (
      {
        not_eligible: "Not eligible",
        display_only: "Display only",
        not_weighted: "Not weighted",
      } as Record<string, string>
    )[status] ||
    status ||
    "Awaiting score"
  );
};

export default function AdminProjectScore({
  score,
}: {
  score: AdminProjectScoreDTO;
}) {
  const frozen = score.basis === "frozen";
  return (
    <details className="admin-project-score" data-basis={score.basis}>
      <summary
        aria-label={`${frozen ? "Frozen" : "Current"} project score breakdown`}
      >
        <span className="admin-project-score-heading">
          <span>{frozen ? "Frozen score" : "Current score"}</span>
          {score.total === null ? (
            <strong className="admin-project-score-awaiting">
              {score.eligibility === "ineligible"
                ? "Not eligible"
                : frozen ? "Not recorded" : "Awaiting scores"}
            </strong>
          ) : (
            <strong>
              {numbers.format(score.total)} <small>points</small>
            </strong>
          )}
        </span>
        <ChevronDown
          className="admin-project-score-chevron"
          size={16}
          aria-hidden="true"
        />
      </summary>
      <div className="admin-project-score-body">
        <div className="admin-project-score-context">
          <span>
            {score.attempt === null
              ? frozen
                ? "Version not recorded"
                : "Not submitted"
              : `Submission ${score.attempt}`}
          </span>
          <span>Policy {score.policyVersion}</span>
          {frozen && score.sourceRevision !== null && (
            <span>Revision {score.sourceRevision}</span>
          )}
          {score.eligibility !== "eligible" && (
            <span>
              {score.eligibility === "ineligible"
                ? "Not eligible"
                : "Eligibility awaiting review"}
            </span>
          )}
        </div>
        <dl>
          {score.components.map((component) => (
            <div key={component.key}>
              <dt>{component.label}</dt>
              <dd>
                {component.value === null ? (
                  <span className="admin-project-score-missing">
                    {frozen
                      ? "Not recorded"
                      : componentStatus(component.key, component.status)}
                  </span>
                ) : (
                  <>
                    <b>
                      {component.key === "penalties" && component.value > 0
                        ? "−"
                        : ""}
                      {numbers.format(component.value)}
                    </b>
                    {component.max !== null && (
                      <small> / {numbers.format(component.max)}</small>
                    )}
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
        {score.pending.length > 0 && (
          <ul
            className="admin-project-score-pending"
            aria-label="Awaiting score requirements"
          >
            {score.pending.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
