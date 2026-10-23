// Explicitly called by a disposable local harness only. No writes at import.
import { batch, one, type Database, type SQL } from "../lib/db";
import type { Identity } from "../lib/identity";
import { sha256 } from "../lib/security";

export const teamControlActors = Object.fromEntries(
  ["leader", "member", "accept", "decline", "solo"].map((key) => [
    key,
    {
      id: "fake_teamqa_" + key,
      email: "teamqa_" + key + "@portal.test",
      name: "Synthetic Team " + key[0].toUpperCase() + key.slice(1),
      source: "local-test",
    } satisfies Identity,
  ]),
) as Record<"leader" | "member" | "accept" | "decline" | "solo", Identity>;

export const teamControlIds = {
  formingTeam: "fake_teamqa_forming",
  soloTeam: "fake_teamqa_solo_team",
  acceptRequest: "fake_teamqa_request_accept",
  declineRequest: "fake_teamqa_request_decline",
} as const;

/** Does not reset policy, overwrite rows, disable triggers or alter existing teams. */
export async function seedTeamControls(
  db: Database,
  options: { scope: "fresh-disposable-local" },
) {
  if (options?.scope !== "fresh-disposable-local")
    throw new Error("TEAM_QA_DISPOSABLE_SCOPE_REQUIRED");
  const reserved = await one<{ n: number }>(
    db,
    "SELECT (SELECT count(*) FROM users WHERE id LIKE 'fake_teamqa_%' OR email LIKE 'teamqa_%@portal.test')+(SELECT count(*) FROM teams WHERE id LIKE 'fake_teamqa_%')+(SELECT count(*) FROM team_actions WHERE id LIKE 'fake_teamqa_%') AS n",
  );
  if (reserved?.n) throw new Error("TEAM_QA_RESERVED_ROWS_ALREADY_EXIST");
  const settings = await one<{ policy: string }>(
    db,
    "SELECT policy FROM event_settings WHERE id=1",
  );
  if (!settings) throw new Error("TEAM_QA_MIGRATED_SEEDED_DB_REQUIRED");
  const time = "2026-10-23T09:00:00.000Z";
  const policy = JSON.parse(settings.policy);
  if (!(time < policy.membershipFreeze && time < policy.ideaLock))
    throw new Error("TEAM_QA_FIXTURE_TIME_OUTSIDE_FORMING_WINDOW");
  const sql: SQL[] = [];
  for (const [index, actor] of Object.values(teamControlActors).entries()) {
    sql.push(
      [
        "INSERT INTO users(id,email,name,role,created_at) VALUES(?,?,?,'participant',?)",
        actor.id,
        actor.email,
        actor.name,
        time,
      ],
      [
        "INSERT INTO profiles(user_id,bio,socials,gender,public) VALUES(?,?,?,?,1)",
        actor.id,
        "Disposable synthetic control fixture.",
        JSON.stringify([
          "https://github.com/synthetic-teamqa-" + index,
          "https://www.linkedin.com/in/synthetic-teamqa-" + index,
        ]),
        "non-binary",
      ],
      [
        "INSERT INTO participant_profiles(user_id,display_name,skills,completed_at,gender_confirmed) VALUES(?,?,?,?,1)",
        actor.id,
        actor.name,
        "Synthetic coding skills",
        time,
      ],
      [
        "INSERT INTO registrations(email,status,luma_confirmed) VALUES(?,'pending',1)",
        actor.email,
      ],
      ["INSERT INTO luma_roster VALUES(?,?,?)", actor.email, actor.id, time],
      [
        "INSERT INTO profile_details(user_id,phone,avatar_color,avatar_expression) VALUES(?,?,?,?)",
        actor.id,
        "+12025550100",
        ["blue", "orange", "purple", "green", "grey"][index],
        ["squeezed", "sleepy", "plus", "cheerful", "round"][index],
      ],
    );
  }
  const hash = await sha256("");
  for (const [id, name, leader, palette] of [
    [teamControlIds.formingTeam, "Synthetic Green Loop", "leader", "forest"],
    [teamControlIds.soloTeam, "Synthetic Solo Team", "solo", "violet"],
  ] as const) {
    sql.push(
      [
        "INSERT INTO teams(id,name,leader_id,bio,created_at) VALUES(?,?,?,?,?)",
        id,
        name,
        teamControlActors[leader].id,
        "Disposable local control fixture only.",
        time,
      ],
      [
        "INSERT INTO memberships(user_id,team_id,joined_at) VALUES(?,?,?)",
        teamControlActors[leader].id,
        id,
        time,
      ],
      [
        "INSERT INTO team_styles(team_id,avatar,palette,color_key) VALUES(?,'initials',?,?)",
        id,
        palette,
        palette,
      ],
      [
        "INSERT INTO ideas(team_id,title,core,description,hash,updated_at) VALUES(?,'','','',?,?)",
        id,
        hash,
        time,
      ],
    );
  }
  sql.push([
    "INSERT INTO memberships(user_id,team_id,joined_at) VALUES(?,?,?)",
    teamControlActors.member.id,
    teamControlIds.formingTeam,
    time,
  ]);
  for (const [requestId, actor] of [
    [teamControlIds.acceptRequest, teamControlActors.accept],
    [teamControlIds.declineRequest, teamControlActors.decline],
  ] as const)
    sql.push([
      "INSERT INTO team_actions(id,team_id,user_id,kind,status,created_at) VALUES(?,?,?,'request','pending',?)",
      requestId,
      teamControlIds.formingTeam,
      actor.id,
      time,
    ]);
  // Atomic: any collision or normal schema trigger failure rolls back this seed.
  await batch(db, sql);
  return { actors: teamControlActors, ids: teamControlIds, time };
}
