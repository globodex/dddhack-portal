"use client";

import { useId, useState, type CSSProperties } from "react";
import type {
  AdminParticipantBreakdown,
  AdminStatsDTO,
} from "../lib/admin-stats";
import { resolveTeamColor } from "../lib/team-color";
import { useHydrated } from "./use-hydrated";

const names = {
  participants: "Participant statistics",
  teams: "Team statistics",
  submissions: "Submission statistics",
};
const palettes = ["cobalt", "forest", "ember", "violet", "rose"];
const numbers = new Intl.NumberFormat("en-IN");
const color = (index: number) => {
  const palette = resolveTeamColor(palettes[index % palettes.length]);
  return {
    "--stat-dot": palette.fill,
    "--stat-wash": palette.wash,
  } as CSSProperties;
};

export default function AdminStats({ stats }: { stats: AdminStatsDTO }) {
  const [detailed, setDetailed] = useState(false);
  const hydrated = useHydrated();
  const contentId = useId();
  const canShowDetails =
    stats.collection === "participants" &&
    stats.cards.some((card) => card.breakdown);
  return (
    <section
      className="admin-collection-stats"
      aria-label={names[stats.collection]}
    >
      <div
        className="admin-collection-stats-header"
        data-has-details={canShowDetails}
      >
        <p className="admin-collection-stats-scope">{stats.scope}</p>
        {canShowDetails && (
          <button
            type="button"
            role="switch"
            className="admin-stats-detail-toggle"
            aria-checked={detailed}
            aria-controls={contentId}
            disabled={!hydrated}
            onClick={() => setDetailed((value) => !value)}
          >
            Detailed view
            <span className="admin-stats-switch" aria-hidden="true" />
          </button>
        )}
      </div>
      <dl
        id={contentId}
        className="admin-collection-stats-grid"
        data-count={stats.cards.length}
        data-breakdown={!!stats.teamSizes}
        data-detailed={canShowDetails && detailed}
      >
        {stats.cards.map((card, index) => (
          <div
            className="admin-collection-stats-card"
            key={card.key}
            style={color(index)}
          >
            <dt>
              <span className="admin-stat-dot" aria-hidden="true" />
              {card.label}
            </dt>
            <dd
              aria-label={
                card.value === null
                  ? "Count unavailable"
                  : card.lowerBound
                    ? `At least ${numbers.format(card.value)}`
                    : undefined
              }
            >
              {card.value === null
                ? "Not available"
                : `${card.lowerBound ? "≥" : ""}${numbers.format(card.value)}`}
            </dd>
            {card.caption && <small>{card.caption}</small>}
            {canShowDetails && detailed && card.breakdown && (
              <ParticipantBreakdown
                breakdown={card.breakdown}
                cohortLabel={card.label}
              />
            )}
          </div>
        ))}
        {stats.teamSizes && (
          <div
            className="admin-collection-stats-card admin-team-size-card"
            style={color(4)}
          >
            <dt>
              <span className="admin-stat-dot" aria-hidden="true" />
              Team sizes
            </dt>
            <dd>
              <dl className="admin-team-size-values">
                {stats.teamSizes.map((size) => (
                  <div key={size.label}>
                    <dt>{size.label}</dt>
                    <dd>{numbers.format(size.value)}</dd>
                  </div>
                ))}
              </dl>
            </dd>
          </div>
        )}
      </dl>
      {stats.note && (
        <p className="admin-collection-stats-note">{stats.note}</p>
      )}
    </section>
  );
}

function ParticipantBreakdown({
  breakdown,
  cohortLabel,
}: {
  breakdown: AdminParticipantBreakdown;
  cohortLabel: string;
}) {
  return (
    <div
      className="admin-stat-breakdown"
      role="group"
      aria-label={`${cohortLabel} demographics`}
    >
      {breakdown.scope && (
        <p className="admin-stat-breakdown-scope">{breakdown.scope}</p>
      )}
      {!breakdown.available ? (
        <p className="admin-stat-breakdown-unavailable">Not available</p>
      ) : (
        (["gender", "profession"] as const).map((dimension) => (
          <section key={dimension} aria-label={`${dimension} breakdown`}>
            <h3>{dimension === "gender" ? "Gender" : "Profession"}</h3>
            <ul>
              {breakdown[dimension].map((bucket) => (
                <li key={bucket.key}>
                  <span>{bucket.label}</span>
                  <b>{numbers.format(bucket.value)}</b>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
