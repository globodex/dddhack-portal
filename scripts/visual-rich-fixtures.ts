// Extra disposable visual states only. Never imported by production code.
import { syntheticImage } from "../tests/fixture-images";
import { draftPolicy } from "../lib/policy";
import { privateVenueSchema } from "../lib/event-content-contract";
export async function seedRichVisual(db: any) {
  const now = new Date().toISOString();
  const policy = {
    ...draftPolicy,
    operationScopes: ["submissions"],
    submissionOpen: new Date(Date.now() - 86400000).toISOString(),
    submissionClose: new Date(Date.now() + 86400000).toISOString(),
    confirmations: [
      ...new Set([...draftPolicy.confirmations, "privacyRetention"]),
    ],
  };
  await db
    .prepare("UPDATE event_settings SET policy=?,active=1 WHERE id=1")
    .bind(JSON.stringify(policy))
    .all();
  for (const who of ["alice", "eve"])
    await db
      .prepare(
        "INSERT INTO manual_checkins SELECT id,lower(email),'fake_admin',? FROM users WHERE id=? ON CONFLICT DO NOTHING",
      )
      .bind(now, "fake_" + who)
      .all();
  for (const [suffix, team, name, attempts] of [
    ["alice", "fake_team1", "Small Wonder", 2],
    ["eve", "fake_team5", "The Fifth Element", 3],
  ] as const) {
    let payload: any = {
      projectName: name,
      problemSolution: "A synthetic project for visual testing.",
      description:
        "This is disposable local fixture content for checking the project layout. It is not a real event entry.",
      github: "https://github.com/example/synthetic-" + suffix,
      demo: "",
      logo: syntheticImage(64, 64),
      banner: syntheticImage(640, 360),
      tools: "Codex\nChatGPT",
      ecosystemSelections: ["Codex", "ChatGPT"],
      cerebrasIntegration: "no",
      contributions: [],
      commitSha: "",
      attestation: true,
    };
    const project = "visual_project_" + suffix,
      version = "visual_" + suffix + "_v" + attempts;
    for (let n = 1; n <= attempts; n++) {
      payload = {
        ...payload,
        description:
          "Synthetic local version " + n + ". " + payload.description,
      };
      // Match the application's commit ordering; never bypass the third-attempt guard.
      if (n === 1)
        await db
          .prepare(
            "INSERT INTO projects(id,team_id,slug,draft,revision,updated_at) VALUES(?,?,?,?,?,?)",
          )
          .bind(
            project,
            team,
            "synthetic-" + suffix,
            JSON.stringify(payload),
            n,
            now,
          )
          .all();
      else
        await db
          .prepare(
            "UPDATE projects SET draft=?,revision=?,updated_at=? WHERE id=?",
          )
          .bind(JSON.stringify(payload), n, now, project)
          .all();
      await db
        .prepare(
          "INSERT INTO submission_versions(id,team_id,attempt,payload,created_at) VALUES(?,?,?,?,?)",
        )
        .bind(
          "visual_" + suffix + "_v" + n,
          team,
          n,
          JSON.stringify(payload),
          now,
        )
        .all();
      await db
        .prepare("UPDATE projects SET published_version_id=? WHERE id=?")
        .bind("visual_" + suffix + "_v" + n, project)
        .all();
    }
    await db
      .prepare(
        "INSERT INTO project_eligibility(project_id,version_id,status,reason,decided_by,updated_at) VALUES(?,?,?,?,?,?)",
      )
      .bind(
        project,
        version,
        "eligible",
        "Synthetic visual fixture decision; not source verification.",
        "fake_admin",
        now,
      )
      .all();
    // Seed a legitimate historical closed-window comment, then reopen the disposable
    // visual window for vote/form previews. No production bypass marker is used.
    await db.prepare("UPDATE event_settings SET policy=? WHERE id=1").bind(JSON.stringify({...policy,submissionClose:now})).all();
    await db
      .prepare(
        "INSERT INTO project_comments(id,project_id,author_id,body,created_at) VALUES(?,?,?,?,?)",
      )
      .bind(
        "visual_comment_" + suffix,
        project,
        "fake_bob",
        "This is a synthetic public comment for the layout preview.",
        now,
      )
      .all();
    await db.prepare("UPDATE event_settings SET policy=? WHERE id=1").bind(JSON.stringify(policy)).all();
    await db
      .prepare(
        "INSERT INTO project_upvotes(project_id,user_id,created_at) VALUES(?,?,?)",
      )
      .bind(project, "fake_bob", now)
      .all();
    await db
      .prepare(
        "INSERT INTO project_review_history(id,project_id,version_id,author_id,kind,body,rating,created_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .bind(
        "visual_feedback_" + suffix,
        project,
        version,
        "fake_admin",
        "admin",
        "Synthetic private team feedback for layout testing.",
        null,
        now,
      )
      .all();
  }
  await db
    .prepare(
      "INSERT INTO credit_inventory(id,type_id,ciphertext,fingerprint,created_at,voucher_value) VALUES(?,?,?,?,?,?)",
    )
    .bind(
      "visual_voucher",
      "fake_credit",
      "",
      "visual-voucher-fingerprint",
      now,
      "SYNTHETIC-NOT-REDEEMABLE-VOUCHER",
    )
    .all();
  await db
    .prepare(
      "INSERT INTO credit_allocations(inventory_id,type_id,user_id,assigned_at,recipient_email) VALUES(?,?,?,?,?)",
    )
    .bind(
      "visual_voucher",
      "fake_credit",
      "fake_alice",
      now,
      "alice@portal.test",
    )
    .all();
  await db
    .prepare(
      "INSERT INTO audit_logs(id,actor_id,action,entity_id,detail,reason,created_at) VALUES(?,?,?,?,?,?,?)",
    )
    .bind(
      "visual_audit",
      "fake_admin",
      "synthetic-fixture",
      "visual-fixture",
      '{"synthetic":true}',
      "Local synthetic visual fixture",
      now,
    )
    .all();
  // Reserved local staff for role-specific rendered verification. No hosted writes.
  for (const role of ["mentor", "volunteer"]) {
    await db.prepare("INSERT INTO users(id,email,name,role,created_at) VALUES(?,?,?,'participant',?)")
      .bind("fake_" + role, role + "@portal.test", "Synthetic " + role, now).all();
    await db.prepare("INSERT INTO portal_roles VALUES(?,?,'fake_admin',?)")
      .bind("fake_" + role, role, now).all();
  }
  for (const [id, role] of [["fake_judge", "judge"], ["fake_mentor", "mentor"]])
    await db.prepare("INSERT INTO project_assignments VALUES('visual_project_alice',?,?)")
      .bind(id, role).all();
}

// Optional visual-review fixture: same real components/permissions, no actual
// attendee/contact/venue/voucher values from the reference image are copied.
export async function seedMockupReview(db: any) {
  const now = new Date().toISOString();
  for (const [suffix, name, color, expression] of [
    ["review_one", "Synthetic Member One", "orange", "sleepy"],
    ["review_two", "Synthetic Member Two", "purple", "plus"],
  ]) {
    const id = "fake_" + suffix, email = suffix + "@portal.test";
    await db.prepare("INSERT INTO users(id,email,name,role,created_at) VALUES(?,?,?,'participant',?)").bind(id,email,name,now).all();
    await db.prepare("INSERT INTO registrations(email,status,luma_confirmed) VALUES(?,'approved',1)").bind(email).all();
    await db.prepare("INSERT INTO luma_roster VALUES(?,'fake_admin',?)").bind(email,now).all();
    await db.prepare("INSERT INTO profiles(user_id,bio,socials,gender,public) VALUES(?,'Synthetic builder',?,'non-binary',1)").bind(id,JSON.stringify(["https://github.com/synthetic-"+suffix])).all();
    await db.prepare("INSERT INTO participant_profiles(user_id,display_name,skills,completed_at,gender_confirmed) VALUES(?,?,'',?,1)").bind(id,name,now).all();
    await db.prepare("INSERT INTO profile_details(user_id,phone,avatar_color,avatar_expression) VALUES(?,?,?,?)").bind(id,"+12025550100",color,expression).all();
    await db.prepare("INSERT INTO memberships VALUES(?,'fake_team1',?)").bind(id,now).all();
  }
  await db.prepare("INSERT INTO team_locks VALUES('fake_team1','fake_alice',?) ON CONFLICT DO NOTHING").bind(now).all();
  const venue = JSON.stringify(privateVenueSchema.parse({ location:"Synthetic arrival point", directions:"Disposable local visual fixture only.", mapUrl:"https://www.google.com/maps?q=synthetic-local-visual-fixture" }));
  await db.prepare("INSERT INTO private_venue(id,draft,published,revision,updated_at) VALUES(1,?,?,1,?) ON CONFLICT(id) DO UPDATE SET draft=excluded.draft,published=excluded.published,revision=private_venue.revision+1,updated_at=excluded.updated_at").bind(venue,venue,now).all();
}
