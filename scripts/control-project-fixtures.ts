// Optional disposable control-audit fixtures. Never import from production code.
import assert from "node:assert/strict";
import { batch, one, type Database, type SQL } from "../lib/db";
import { validateProjectImage } from "../lib/project-media";

export const controlProjectIds = Array.from({ length: 25 }, (_, index) => {
  const suffix = String(index).padStart(2, "0");
  return {
    userId: `fake_control_user_${suffix}`,
    email: `control${suffix}@portal.test`,
    teamId: `fake_control_team_${suffix}`,
    projectId: `fake_control_project_${suffix}`,
    versionId: `fake_control_version_${suffix}`,
    slug: `synthetic-control-${suffix}`,
    name: `Synthetic Control Project ${suffix}`,
  };
});

export async function seedControlProjects(db: Database) {
  // Requires the root's rich fixture. Do not modify Alice, Eve, settings or time.
  const source = await one<{
    payload: string;
    created_at: string;
    membership_at: string;
  }>(
    db,
    "SELECT v.payload,v.created_at,t.created_at membership_at FROM projects p JOIN teams t ON t.id=p.team_id JOIN submission_versions v ON v.id=p.published_version_id AND v.team_id=p.team_id WHERE p.id='visual_project_alice' AND p.team_id='fake_team1' AND p.slug='synthetic-alice'",
  );
  assert.ok(source, "Seed --rich before the optional --control-audit fixture");
  const admin = await one(db, "SELECT id FROM users WHERE id='fake_admin'");
  assert.ok(admin, "Requires the synthetic local administrator");
  const collision = await one<{ n: number }>(
    db,
    "SELECT (SELECT count(*) FROM users WHERE id LIKE 'fake_control_user_%')+(SELECT count(*) FROM teams WHERE id LIKE 'fake_control_team_%')+(SELECT count(*) FROM projects WHERE id LIKE 'fake_control_project_%') n",
  );
  assert.equal(
    collision?.n,
    0,
    "Control fixtures require a fresh disposable database",
  );
  const original = JSON.parse(source.payload);
  validateProjectImage(original.logo, "logo");
  validateProjectImage(original.banner, "banner");
  const time = source.created_at;
  const membershipTime = source.membership_at;
  for (const item of controlProjectIds) {
    // Reuse actual valid rich-fixture raster bytes, never remote assets or keys.
    const payload = JSON.stringify({
      projectName: item.name,
      problemSolution:
        "Synthetic local project for pagination and control testing.",
      description:
        "Disposable local control fixture. This is not an event entry or a verified OpenAI integration.",
      github: `https://github.com/example/${item.slug}`,
      demo: "",
      logo: original.logo,
      banner: original.banner,
      tools: "",
      ecosystemSelections: [],
      cerebrasIntegration: "no",
      contributions: [],
      commitSha: "",
      attestation: true,
    });
    const statements: SQL[] = [
      [
        "INSERT INTO users(id,email,name,role,created_at) VALUES(?,?,?,'participant',?)",
        item.userId,
        item.email,
        item.name + " Builder",
        membershipTime,
      ],
      [
        "INSERT INTO registrations(email,status,luma_confirmed) VALUES(?,'approved',1)",
        item.email,
      ],
      ["INSERT INTO luma_roster VALUES(?,'fake_admin',?)", item.email, time],
      [
        "INSERT INTO profiles(user_id,bio,socials,gender,public) VALUES(?,'Synthetic control builder','[]','non-binary',1)",
        item.userId,
      ],
      [
        "INSERT INTO participant_profiles(user_id,display_name,skills,completed_at,gender_confirmed) VALUES(?,?,'',?,1)",
        item.userId,
        item.name + " Builder",
        time,
      ],
      [
        "INSERT INTO profile_details(user_id,avatar_color,avatar_expression) VALUES(?,'blue','squeezed')",
        item.userId,
      ],
      [
        "INSERT INTO manual_checkins(user_id,verified_email,actor_id,created_at) VALUES(?,?,'fake_admin',?)",
        item.userId,
        item.email,
        time,
      ],
      [
        "INSERT INTO teams(id,name,leader_id,bio,created_at) VALUES(?,?,?,'Disposable synthetic control team',?)",
        item.teamId,
        item.name + " Team",
        item.userId,
        membershipTime,
      ],
      [
        "INSERT INTO memberships(user_id,team_id,joined_at) VALUES(?,?,?)",
        item.userId,
        item.teamId,
        membershipTime,
      ],
      [
        "INSERT INTO projects(id,team_id,slug,draft,revision,updated_at) VALUES(?,?,?,?,1,?)",
        item.projectId,
        item.teamId,
        item.slug,
        payload,
        time,
      ],
      [
        "INSERT INTO submission_versions(id,team_id,attempt,payload,created_at) VALUES(?,?,1,?,?)",
        item.versionId,
        item.teamId,
        payload,
        time,
      ],
      [
        "UPDATE projects SET published_version_id=? WHERE id=?",
        item.versionId,
        item.projectId,
      ],
      [
        "INSERT INTO project_eligibility(project_id,version_id,status,reason,decided_by,updated_at) VALUES(?,?,'eligible','Synthetic local control fixture only','fake_admin',?)",
        item.projectId,
        item.versionId,
        time,
      ],
    ];
    await batch(db, statements);
  }
  return {
    syntheticOnly: true,
    added: controlProjectIds.length,
    projects: controlProjectIds,
    untouched: [
      "visual_project_alice",
      "visual_project_eve",
      "event_settings",
      "scoring_settings",
    ],
  };
}
