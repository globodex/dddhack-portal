import { rows, type Database } from "./db";
import { personFacts } from "./directory-facts";
import { registeredEmailPredicate } from "./roster";

/** Public project detail identities only. Never select contacts, status or profile details. */
export function publicProjectMembers(db: Database, teamId: string) {
  return rows<{
    id: string;
    name: string;
    avatarColor: string;
    avatarExpression: string;
  }>(
    db,
    `SELECT u.id,COALESCE(pp.display_name,u.name) name,pd.avatar_color avatarColor,pd.avatar_expression avatarExpression
     FROM memberships m JOIN users u ON u.id=m.user_id
     JOIN participant_profiles pp ON pp.user_id=u.id
     LEFT JOIN profile_details pd ON pd.user_id=u.id
     LEFT JOIN portal_roles roles ON roles.user_id=u.id
     WHERE m.team_id=? AND COALESCE(roles.role,u.role)='participant'
       AND ${registeredEmailPredicate("u.email")} AND pp.completed_at IS NOT NULL
       AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.kind='participant' AND r.target_id=u.id AND r.active=1)
       AND NOT EXISTS(SELECT 1 FROM terminal_record_deletions r WHERE r.kind='participant' AND r.target_id=u.id)
     ORDER BY CASE WHEN u.id=(SELECT leader_id FROM teams WHERE id=m.team_id) THEN 0 ELSE 1 END,COALESCE(pp.display_name,u.name),u.id`,
    teamId,
  );
}

/** Called only after the existing owner/admin review authorization. */
export async function adminSubmissionMembers(db: Database, teamId: string) {
  const members = await rows<{
    id: string;
    name: string;
    avatarColor: string;
    avatarExpression: string;
  }>(
    db,
    `SELECT u.id,COALESCE(pp.display_name,u.name) name,pd.avatar_color avatarColor,pd.avatar_expression avatarExpression
     FROM memberships m JOIN users u ON u.id=m.user_id
     LEFT JOIN participant_profiles pp ON pp.user_id=u.id
     LEFT JOIN profile_details pd ON pd.user_id=u.id
     WHERE m.team_id=?
       AND NOT EXISTS(SELECT 1 FROM terminal_record_deletions r WHERE r.kind='participant' AND r.target_id=u.id)
     ORDER BY CASE WHEN u.id=(SELECT leader_id FROM teams WHERE id=m.team_id) THEN 0 ELSE 1 END,COALESCE(pp.display_name,u.name),u.id`,
    teamId,
  );
  const facts = await personFacts(
    db,
    members.map((member) => member.id),
  );
  return members.map((member) => ({
    ...member,
    status: facts.get(member.id)?.status || "Registered",
  }));
}
