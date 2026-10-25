import type { AdminStatsDTO } from "../lib/admin-stats";

const names = {
  participants: "Participant statistics",
  teams: "Team statistics",
  submissions: "Submission statistics",
};
const numbers = new Intl.NumberFormat("en-IN");

export default function AdminStats({ stats }: { stats: AdminStatsDTO }) {
  return (
    <section
      className="admin-collection-stats"
      aria-label={names[stats.collection]}
    >
      <p className="admin-collection-stats-scope">{stats.scope}</p>
      <dl className="admin-collection-stats-grid">
        {stats.cards.map((card) => (
          <div className="admin-collection-stats-card" key={card.key}>
            <dt>{card.label}</dt>
            <dd>{numbers.format(card.value)}</dd>
          </div>
        ))}
      </dl>
      {stats.note && (
        <p className="admin-collection-stats-note">{stats.note}</p>
      )}
    </section>
  );
}
