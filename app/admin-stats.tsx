import type { CSSProperties } from "react";
import type { AdminStatsDTO } from "../lib/admin-stats";
import { resolveTeamColor } from "../lib/team-color";

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
  return (
    <section
      className="admin-collection-stats"
      aria-label={names[stats.collection]}
    >
      <p className="admin-collection-stats-scope">{stats.scope}</p>
      <dl
        className="admin-collection-stats-grid"
        data-count={stats.cards.length}
        data-breakdown={!!stats.teamSizes}
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
              aria-label={card.value === null ? "Count unavailable" : undefined}
            >
              {card.value === null ? "Not available" : numbers.format(card.value)}
            </dd>
            {card.caption && <small>{card.caption}</small>}
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
