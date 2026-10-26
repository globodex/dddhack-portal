import type { AdminSubmissionAnalyticsDTO } from "../lib/admin-submission-analytics";

const numbers = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
type Counts = { key: string; label: string; value: number }[];

function CountList({ rows }: { rows: Counts }) {
  return (
    <dl className="admin-analytics-counts">
      {rows.map((row) => (
        <div key={row.key}>
          <dt>{row.label}</dt>
          <dd>{numbers.format(row.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function AdminSubmissionAnalytics({
  analytics,
}: {
  analytics: AdminSubmissionAnalyticsDTO;
}) {
  const { scores, policy, frozen } = analytics;
  return (
    <section
      className="admin-submission-analytics"
      aria-label="Submission analytics"
    >
      <header className="admin-analytics-header">
        <h2>Submission insights</h2>
        <p>
          {analytics.scope} · {numbers.format(analytics.cohortTotal)}
        </p>
      </header>
      {analytics.selectionMissing > 0 && (
        <p className="admin-analytics-selection-note" role="status">
          {numbers.format(analytics.selectionMissing)}{" "}
          {analytics.selectionMissing === 1
            ? "project has an unavailable selected submission"
            : "projects have unavailable selected submissions"}
          .
        </p>
      )}
      <div className="admin-analytics-grid">
        <section
          className="admin-analytics-panel"
          aria-label="Cerebras integration"
        >
          <h3>
            <span
              className="admin-analytics-dot is-cobalt"
              aria-hidden="true"
            />
            Cerebras integration
          </h3>
          <CountList rows={analytics.cerebras} />
        </section>
        <section
          className="admin-analytics-panel"
          aria-label="Evaluation coverage"
        >
          <h3>
            <span
              className="admin-analytics-dot is-violet"
              aria-hidden="true"
            />
            Evaluation coverage
          </h3>
          <CountList rows={analytics.evaluation} />
          <details className="admin-analytics-disclosure">
            <summary>Eligibility</summary>
            <CountList rows={analytics.eligibility} />
          </details>
        </section>
        <section
          className="admin-analytics-panel"
          aria-label="Current score coverage"
        >
          <h3>
            <span
              className="admin-analytics-dot is-forest"
              aria-hidden="true"
            />
            Current scores
          </h3>
          <CountList
            rows={[
              { key: "complete", label: "Complete", value: scores.complete },
              {
                key: "awaiting",
                label: "Awaiting scores",
                value: scores.awaiting,
              },
            ]}
          />
          <div className="admin-analytics-score-summary">
            <p>
              Eligible with complete scores{" "}
              <b>{numbers.format(scores.eligibleComparable)}</b>
            </p>
            <dl>
              {(
                [
                  ["Average", scores.average],
                  ["Lowest", scores.minimum],
                  ["Highest", scores.maximum],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    {value === null ? (
                      <span className="admin-analytics-no-score">
                        Not available
                      </span>
                    ) : (
                      numbers.format(value)
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="admin-analytics-policy">
            {policy.baseMaximum !== null && policy.feedbackMaximum !== null
              ? `${numbers.format(policy.baseMaximum)} base + up to ${numbers.format(policy.feedbackMaximum)} feedback, before penalties`
              : policy.maxTotal === null
                ? "Score maximum unavailable"
                : `${numbers.format(policy.maxTotal)} points maximum before penalties`}
          </p>
          {policy.blockers.length > 0 && (
            <details className="admin-analytics-disclosure">
              <summary>Scoring requirements</summary>
              <ul className="admin-analytics-requirements">
                {policy.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </details>
          )}
        </section>
      </div>
      {frozen && (
        <aside
          className="admin-analytics-frozen"
          aria-label="Frozen result snapshot"
        >
          <strong>Frozen results</strong>
          <span>
            {numbers.format(frozen.entryCount)} projects ·{" "}
            {numbers.format(frozen.eligibleCount)} eligible
          </span>
          <span>
            Policy {frozen.policyVersion} · Revision {frozen.sourceRevision}
          </span>
          {frozen.invalidEntries > 0 && (
            <span>
              {numbers.format(frozen.invalidEntries)}{" "}
              {frozen.invalidEntries === 1
                ? "entry unavailable"
                : "entries unavailable"}
            </span>
          )}
          <time dateTime={frozen.createdAt}>
            {new Intl.DateTimeFormat("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Kolkata",
            }).format(new Date(frozen.createdAt))}{" "}
            IST
          </time>
        </aside>
      )}
    </section>
  );
}
