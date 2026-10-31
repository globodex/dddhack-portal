import { rows, type Database } from "./db";
import { personFacts } from "./directory-facts";
import {
  selectedProfileFacts,
  type ProfileViewer,
  type SelectedProfileFacts,
} from "./selected-profile-facts";
import { registeredEmailPredicate } from "./roster";

/** Anonymous detail stays identities-only. Authenticated enrichment uses selected-profile permissions. */
export async function publicProjectMembers(
  db: Database,
  teamId: string,
  viewer?: ProfileViewer | null,
) {
  const members = await rows<{
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
     WHERE m.team_id=?
       AND ${registeredEmailPredicate("u.email")} AND pp.completed_at IS NOT NULL
       AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.kind='participant' AND r.target_id=u.id AND r.active=1)
       AND NOT EXISTS(SELECT 1 FROM terminal_record_deletions r WHERE r.kind='participant' AND r.target_id=u.id)
     ORDER BY CASE WHEN u.id=(SELECT leader_id FROM teams WHERE id=m.team_id) THEN 0 ELSE 1 END,COALESCE(pp.display_name,u.name),u.id`,
    teamId,
  );
  return viewer && !viewer.deactivated
    ? inlineMemberProfiles(db, members, viewer, true)
    : members;
}

/** Called only after the existing owner/admin review authorization. */
export async function adminSubmissionMembers(
  db: Database,
  teamId: string,
  viewer?: ProfileViewer,
) {
  const members = await rows<{
    id: string;
    name: string;
    email: string;
    avatarColor: string;
    avatarExpression: string;
  }>(
    db,
    `SELECT u.id,u.email,COALESCE(pp.display_name,u.name) name,pd.avatar_color avatarColor,pd.avatar_expression avatarExpression
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
  const enriched = viewer
    ? await inlineMemberProfiles(db, members, viewer)
    : members;
  return enriched.map((member) => ({
    ...member,
    status: facts.get(member.id)?.status || "Registered",
  }));
}

async function inlineMemberProfiles<T extends { id: string }>(
  db: Database,
  members: T[],
  viewer: ProfileViewer,
  publicProject = false,
) {
  const extras = await rows<
    SelectedProfileFacts & {
      id: string;
      publicBio: string;
      publicSocials: string;
    }
  >(
    db,
    `
    SELECT p.user_id id,p.bio,p.socials,p.gender,p.gender_description genderDescription,
    pd.best_description profession,pd.organization,pd.openai_org_id openaiOrgId,pd.phone,
    CASE WHEN p.public=1 THEN p.bio ELSE '' END publicBio,CASE WHEN p.public=1 THEN p.socials ELSE '[]' END publicSocials,
    CASE WHEN EXISTS(SELECT 1 FROM memberships target JOIN memberships viewer ON viewer.team_id=target.team_id WHERE target.user_id=p.user_id AND viewer.user_id=?) THEN 1 ELSE 0 END sameTeam
    FROM profiles p JOIN profile_details pd ON pd.user_id=p.user_id WHERE p.user_id IN (${members.map(() => "?").join(",") || "NULL"})`,
    viewer.id,
    ...members.map((member) => member.id),
  );
  const byId = new Map(extras.map((extra) => [extra.id, extra]));
  return members.map((member) => {
    const extra = byId.get(member.id);
    if (!extra) return member;
    const permitted = selectedProfileFacts(extra, viewer, member.id);
    if (publicProject) {
      // A public project route never carries contacts, org IDs, private bio or private social links.
      // Keep profession scoped exactly as the selected-profile permission (self/admin).
      return {
        ...member,
        bio: extra.publicBio,
        socials: JSON.parse(extra.publicSocials || "[]"),
        details: {
          ...(permitted.details.gender
            ? { gender: permitted.details.gender }
            : {}),
          ...(permitted.details.profession
            ? { profession: permitted.details.profession }
            : {}),
        },
      };
    }
    return {
      ...member,
      bio: extra.publicBio,
      socials: JSON.parse(extra.publicSocials || "[]"),
      ...permitted,
    };
  });
}
