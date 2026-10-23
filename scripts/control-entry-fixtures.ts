// Optional fresh-disposable control fixtures. Never imported by application code.
import { batch, one, type Database, type SQL } from "../lib/db";

export async function seedControlEntries(db: Database, projectExtras = false) {
  if (await one(db, "SELECT id FROM users WHERE id='fake_first_leader'"))
    throw new Error("FRESH_CONTROL_DATABASE_REQUIRED");
  const time = "2026-10-23T08:00:00.000Z";
  const sql: SQL[] = [];
  for (const [suffix, name] of [
    ["mentor", "Synthetic mentor"],
    ["volunteer", "Synthetic volunteer"],
    ["first_leader", "Synthetic First Leader"],
    ...(projectExtras ? [["first_member", "Synthetic First Member"]] : []),
  ]) {
    const id = "fake_" + suffix,
      email = suffix + "@portal.test";
    if (suffix.startsWith("first_"))
      sql.push([
        "INSERT INTO users(id,email,name,role,created_at) VALUES(?,?,?,'participant',?)",
        id,
        email,
        name,
        time,
      ]);
    sql.push(
      [
        "INSERT INTO registrations(email,status,luma_confirmed) VALUES(?,'approved',1)",
        email,
      ],
      [
        "INSERT INTO luma_roster(email,imported_by,imported_at) VALUES(?,'fake_admin',?)",
        email,
        time,
      ],
      [
        "INSERT INTO profiles(user_id,bio,socials,gender,public) VALUES(?,'Synthetic local control profile','[]','non-binary',0)",
        id,
      ],
      [
        "INSERT INTO participant_profiles(user_id,display_name,skills,completed_at,gender_confirmed) VALUES(?,?,'',?,1)",
        id,
        name,
        time,
      ],
      [
        "INSERT INTO profile_details(user_id,phone,avatar_color,avatar_expression) VALUES(?,'+12025550100','blue','squeezed')",
        id,
      ],
    );
  }
  sql.push(
    [
      "INSERT INTO manual_checkins(user_id,verified_email,actor_id,created_at) VALUES('fake_first_leader','first_leader@portal.test','fake_admin',?)",
      time,
    ],
    [
      "INSERT INTO teams(id,name,leader_id,bio,created_at) VALUES('fake_first_team','Synthetic First Team','fake_first_leader','Synthetic local fixture',?)",
      time,
    ],
    [
      "INSERT INTO memberships(user_id,team_id,joined_at) VALUES('fake_first_leader','fake_first_team',?)",
      time,
    ],
  );
  if (projectExtras) {
    const source = await one<{ payload: string }>(
      db,
      "SELECT v.payload FROM projects p JOIN submission_versions v ON v.id=p.published_version_id WHERE p.id='visual_project_alice'",
    );
    if (!source) throw new Error("RICH_PROJECT_FIXTURE_REQUIRED");
    const draft = {
      ...JSON.parse(source.payload),
      projectName: "Synthetic unpublished draft",
      problemSolution:
        "A saved team draft visible only to authorized teammates",
    };
    sql.push(
      [
        "INSERT INTO memberships(user_id,team_id,joined_at) VALUES('fake_first_member','fake_first_team',?)",
        time,
      ],
      [
        "INSERT INTO projects(id,team_id,slug,draft,revision,updated_at) VALUES('fake_unpublished_project','fake_first_team','synthetic-unpublished',?,1,?)",
        JSON.stringify(draft),
        time,
      ],
    );
  }
  await batch(db, sql);
}
