// Fresh local SQLite fixture only. Never connects to a hosted database.
import { LocalDatabase } from "../../lib/local-test/sqlite";
import { seedLocal } from "../../scripts/fixtures";
import { seedRichVisual } from "../../scripts/visual-rich-fixtures";
import { existsSync, writeFileSync } from "node:fs";
const path =
  process.env.PORTAL_QA_DB || "/tmp/ddd-project-scroll-qa/fixture.sqlite";
if (existsSync(path)) throw Error("Fresh fixture required");
const db = new LocalDatabase(path);
db.migrate();
await seedLocal(db);
await seedRichVisual(db);
try {
  const original = db.raw
    .prepare("SELECT draft FROM projects WHERE id='visual_project_alice'")
    .get() as any;
  for (let n = 0; n < 58; n++) {
    const suffix = String(n).padStart(2, "0"),
      user = "scroll_user_" + suffix,
      team = "scroll_team_" + suffix,
      project = "scroll_project_" + suffix,
      version = project + "_v1",
      now = new Date(Date.now() + n * 1000).toISOString();
    db.raw
      .prepare(
        "INSERT INTO users(id,email,name,role,created_at) VALUES(?,?,?,?,?)",
      )
      .run(
        user,
        `${user}@portal.test`,
        "Synthetic Scroll Builder " + suffix,
        "participant",
        now,
      );
    db.raw
      .prepare("INSERT INTO profiles(user_id,public,bio) VALUES(?,1,?)")
      .run(user, "Synthetic pagination fixture");
    db.raw
      .prepare(
        "INSERT INTO participant_profiles(user_id,display_name,skills,completed_at,gender_confirmed) VALUES(?,?,?,?,1)",
      )
      .run(user, "Synthetic Scroll Builder " + suffix, "Local testing", now);
    db.raw
      .prepare(
        "INSERT INTO profile_details(user_id,phone,best_description,organization,openai_org_id,avatar_color,avatar_expression) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        user,
        "+12025550100",
        "Student",
        "Synthetic Studio",
        "",
        "orange",
        "plus",
      );
    db.raw
      .prepare(
        "INSERT INTO registrations(email,status,luma_confirmed) VALUES(?,?,1)",
      )
      .run(`${user}@portal.test`, "approved");
    db.raw
      .prepare("INSERT INTO manual_checkins VALUES(?,?,?,?)")
      .run(user, `${user}@portal.test`, "fake_admin", now);
    db.raw
      .prepare(
        "INSERT INTO teams(id,name,leader_id,bio,created_at) VALUES(?,?,?,?,?)",
      )
      .run(team, "Scroll Team " + suffix, user, "Synthetic private idea", now);
    db.raw
      .prepare(
        "INSERT INTO memberships(user_id,team_id,joined_at) VALUES(?,?,?)",
      )
      .run(user, team, now);
    const payload = JSON.stringify({
      ...JSON.parse(original.draft),
      projectName: "Scroll Project " + suffix,
      problemSolution: "A synthetic project for scroll-loading checks.",
      description: "Synthetic local pagination entry " + suffix,
    });
    db.raw
      .prepare(
        "INSERT INTO projects(id,team_id,slug,draft,revision,updated_at) VALUES(?,?,?,?,1,?)",
      )
      .run(project, team, "scroll-project-" + suffix, payload, now);
    db.raw
      .prepare("INSERT INTO submission_versions VALUES(?,?,1,?,?)")
      .run(version, team, payload, now);
    db.raw
      .prepare("UPDATE projects SET published_version_id=? WHERE id=?")
      .run(version, project);
    db.raw
      .prepare(
        "INSERT INTO project_eligibility VALUES(?,?,'eligible','Synthetic local decision',?,?)",
      )
      .run(project, version, "fake_admin", now);
  }
  const counts = Object.fromEntries(
    [
      "users",
      "teams",
      "projects",
      "submission_versions",
      "project_upvotes",
    ].map((t) => [
      t,
      (db.raw.prepare("SELECT count(*) n FROM " + t).get() as any).n,
    ]),
  );
  writeFileSync(
    path + ".receipt.json",
    JSON.stringify({ syntheticOnly: true, path, counts }, null, 2),
  );
  console.log(counts);
} finally {
  db.close();
}
