import { rows, type Database } from "./db";

export type PublicProjectFact = {
  id: string;
  team_id: string;
  published_version_id: string | null;
  payload: string | null;
  teamName: string;
  firstSubmittedAt: string | null;
  eligibility: string;
  removed: number;
  upvotes: number;
  comments: number;
  upvoted: number;
};

/** Selected response facts only. Never keep this map beyond the current request. */
export async function publicProjectFacts(
  db: Database,
  ids: string[],
  actorId?: string,
) {
  const selected = [...new Set(ids)];
  const facts = new Map<string, PublicProjectFact>();
  for (let at = 0; at < selected.length; at += 80) {
    const chunk = selected.slice(at, at + 80);
    const result = await rows<PublicProjectFact>(
      db,
      `WITH selected AS (
        SELECT id,team_id,published_version_id FROM projects WHERE id IN (${chunk.map(() => "?").join(",")})
      ), attempts AS (
        SELECT v.team_id,min(v.attempt) first_attempt,max(v.attempt) latest_attempt
        FROM submission_versions v JOIN selected s ON s.team_id=v.team_id GROUP BY v.team_id
      ), votes AS (
        SELECT u.project_id,count(*) total,max(CASE WHEN u.user_id=? THEN 1 ELSE 0 END) voted
        FROM project_upvotes u JOIN selected s ON s.id=u.project_id GROUP BY u.project_id
      ), comments AS (
        SELECT c.project_id,count(*) total FROM project_comments c
        JOIN selected s ON s.id=c.project_id GROUP BY c.project_id
      )
      SELECT s.id,s.team_id,s.published_version_id,published.payload,t.name teamName,
        first.created_at firstSubmittedAt,COALESCE(e.status,r.eligibility,'needs_review') eligibility,
        EXISTS(SELECT 1 FROM record_removals rr WHERE rr.active=1 AND
          ((rr.kind='project' AND rr.target_id=s.id) OR (rr.kind='submission' AND rr.target_id=s.published_version_id))) removed,
        COALESCE(votes.total,0) upvotes,COALESCE(comments.total,0) comments,COALESCE(votes.voted,0) upvoted
      FROM selected s JOIN teams t ON t.id=s.team_id
      LEFT JOIN attempts a ON a.team_id=s.team_id
      LEFT JOIN submission_versions first ON first.team_id=s.team_id AND first.attempt=a.first_attempt
      LEFT JOIN submission_versions latest ON latest.team_id=s.team_id AND latest.attempt=a.latest_attempt
      LEFT JOIN submission_versions published ON published.id=s.published_version_id AND published.team_id=s.team_id
      LEFT JOIN project_eligibility e ON e.project_id=s.id AND e.version_id=latest.id
      LEFT JOIN reviews r ON r.team_id=s.team_id AND r.version_id=latest.id
      LEFT JOIN votes ON votes.project_id=s.id LEFT JOIN comments ON comments.project_id=s.id`,
      ...chunk,
      actorId || null,
    );
    for (const fact of result) facts.set(fact.id, fact);
  }
  return facts;
}
