import { rows, type Database } from "./db";
import { registeredEmailPredicate } from "./roster";

type Member = {
  id: string;
  name: string;
  avatarColor: string | null;
  avatarExpression: string | null;
  profileUrl: string;
};
/** Same identity eligibility as participant discovery. Privacy flags continue to
 * gate bios/socials there; neither private nor public profile details enter here.
 * Query bounded team-ID chunks, never one query per team or a client request.
 */
export async function publicTeamMembers(
  db: Database,
  teamIds: readonly string[],
) {
  const ids = [...new Set(teamIds)],
    result = new Map<string, Member[]>();
  for (let start = 0; start < ids.length; start += 80) {
    const part = ids.slice(start, start + 80);
    const found = await rows<Omit<Member, "profileUrl"> & { teamId: string }>(
      db,
      `SELECT m.team_id teamId,u.id,COALESCE(NULLIF(pp.display_name,''),u.name) name,pd.avatar_color avatarColor,pd.avatar_expression avatarExpression
       FROM memberships m JOIN teams t ON t.id=m.team_id JOIN users u ON u.id=m.user_id
       JOIN participant_profiles pp ON pp.user_id=u.id JOIN profiles p ON p.user_id=u.id JOIN profile_details pd ON pd.user_id=u.id
       LEFT JOIN portal_roles pr ON pr.user_id=u.id
       WHERE m.team_id IN (${part.map(() => "?").join(",")}) AND COALESCE(pr.role,u.role)='participant'
       AND ${registeredEmailPredicate("u.email")} AND pp.completed_at IS NOT NULL AND pd.phone<>''
       AND NOT EXISTS(SELECT 1 FROM record_removals rr WHERE rr.active=1 AND ((rr.kind='participant' AND rr.target_id=u.id) OR (rr.kind='team' AND rr.target_id=t.id)))
       ORDER BY m.team_id,CASE WHEN u.id=t.leader_id THEN 0 ELSE 1 END,m.joined_at,u.id`,
      ...part,
    );
    for (const { teamId, ...member } of found) {
      const current = result.get(teamId) || [];
      current.push({
        ...member,
        profileUrl:
          "/discover/participants#person-" + encodeURIComponent(member.id),
      });
      result.set(teamId, current);
    }
  }
  return result;
}
