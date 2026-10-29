"use client";

import { useId, useState, type CSSProperties } from "react";
import type {
  AdminParticipantBreakdown,
  AdminStatsDTO,
  TeamSizeGroupKey,
} from "../lib/admin-stats";
import { resolveTeamColor } from "../lib/team-color";
import { useHydrated } from "./use-hydrated";
import { genderBreakdownDisplay } from "./profile-gender-options";

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
  const [teamSizeGroup, setTeamSizeGroup] = useState<TeamSizeGroupKey>("total");
  const sizeGroup =
    stats.teamSizeGroups?.find((group) => group.key === teamSizeGroup) ||
    stats.teamSizeGroups?.find((group) => group.key === "total");
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
            {card.participants !== undefined && <small className="admin-stat-participants">{numbers.format(card.participants)} {card.participants === 1 ? "participant" : "participants"}</small>}
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
              {stats.teamSizeGroups && (
                <select
                  className="admin-team-size-select"
                  aria-label="Team sizes by status"
                  aria-controls={`${contentId}-team-sizes`}
                  value={sizeGroup?.key || "total"}
                  disabled={!hydrated}
                  onChange={(event) =>
                    setTeamSizeGroup(event.target.value as TeamSizeGroupKey)
                  }
                >
                  {stats.teamSizeGroups.map((group) => (
                    <option key={group.key} value={group.key}>
                      {group.label}
                    </option>
                  ))}
                </select>
              )}
            </dt>
            <dd>
              <dl
                id={`${contentId}-team-sizes`}
                className="admin-team-size-values"
                aria-label={`${sizeGroup?.label || "Total"} team sizes`}
                aria-live="polite"
                aria-atomic="true"
              >
                {(sizeGroup?.sizes || stats.teamSizes).map((size) => (
                  <div key={size.label}>
                    <dt>{size.label}</dt>
                    <dd>{numbers.format(size.value)}</dd>
                  </div>
                ))}
              </dl>
            </dd>
            {sizeGroup && (
              <small className="admin-team-size-caption">
                <b>
                  {numbers.format(sizeGroup.total)}{" "}
                  {sizeGroup.total === 1 ? "team" : "teams"}
                </b>{" "}
                {sizeGroup.participants !== undefined && <span className="admin-stat-participants">{numbers.format(sizeGroup.participants)} {sizeGroup.participants === 1 ? "participant" : "participants"}</span>}
                <span>{sizeGroup.description}</span>
                {sizeGroup.empty > 0 && (
                  <span>
                    {numbers.format(sizeGroup.empty)}{" "}
                    {sizeGroup.empty === 1 ? "team has" : "teams have"} no
                    members.
                  </span>
                )}
                {sizeGroup.overCapacity > 0 && (
                  <span>
                    {numbers.format(sizeGroup.overCapacity)}{" "}
                    {sizeGroup.overCapacity === 1 ? "team has" : "teams have"}{" "}
                    more than 5 members.
                  </span>
                )}
              </small>
            )}
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
  const gender = genderBreakdownDisplay(breakdown.gender);
  const genderNotes = [
    ...(gender.notProvided > 0
      ? [`Not provided: ${numbers.format(gender.notProvided)}`]
      : []),
    ...(gender.otherSaved > 0
      ? [`Other saved responses: ${numbers.format(gender.otherSaved)}`]
      : []),
  ];
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
              {(dimension === "gender"
                ? gender.choices
                : breakdown.profession
              ).map((bucket) => (
                <li key={bucket.key}>
                  <span>{bucket.label}</span>
                  <b>{numbers.format(bucket.value)}</b>
                </li>
              ))}
            </ul>
            {dimension === "gender" && genderNotes.length > 0 && (
              <p className="admin-stat-breakdown-note">
                {genderNotes.join(" · ")}
              </p>
            )}
          </section>
        ))
      )}
    </div>
  );
}
