// Deterministic synthetic fixture construction. No network or persistence at import.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
export const defaultSeed = 0x30090005;
function generator(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}
export function makeLoad300(seed = defaultSeed) {
  const random = generator(seed);
  const participants = Array.from({ length: 300 }, (_, index) => ({
    index,
    id: `load300_p_${String(index).padStart(3, "0")}`,
    email: `participant${String(index).padStart(3, "0")}@load300.test`,
    name: `Synthetic Participant ${String(index).padStart(3, "0")}`,
    role: "participant",
  }));
  const shuffled = [...participants];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const teams = Array.from({ length: 90 }, (_, index) => ({
    index,
    id: `load300_team_${String(index).padStart(2, "0")}`,
    name: `Synthetic Load Team ${String(index).padStart(2, "0")}`,
    members: [shuffled[index].id],
    leaderId: shuffled[index].id,
  }));
  for (const participant of shuffled.slice(90)) {
    const available = teams.filter((team) => team.members.length < 5);
    available[Math.floor(random() * available.length)].members.push(
      participant.id,
    );
  }
  for (const team of teams)
    for (const id of team.members)
      participants.find((p) => p.id === id).teamIndex = team.index;
  const operations = [0, 1].map((index) => ({
    id: `load300_operations_${index}`,
    email: `operations${index}@load300.test`,
    name: `Synthetic Operations ${index}`,
    role: "admin",
  }));
  const sizes = Object.fromEntries(
    [1, 2, 3, 4, 5].map((size) => [
      size,
      teams.filter((team) => team.members.length === size).length,
    ]),
  );
  const assignmentSHA256 = createHash("sha256")
    .update(
      JSON.stringify(
        teams.map((team) => ({
          id: team.id,
          leaderId: team.leaderId,
          members: team.members,
        })),
      ),
    )
    .digest("hex");
  assert.equal(participants.length, 300);
  assert.equal(teams.length, 90);
  assert.equal(new Set(teams.flatMap((team) => team.members)).size, 300);
  assert.equal(
    teams.reduce((n, t) => n + t.members.length, 0),
    300,
  );
  assert(
    teams.every(
      (t) =>
        t.members.length >= 1 &&
        t.members.length <= 5 &&
        t.members.includes(t.leaderId),
    ),
  );
  assert(
    operations.every((p) => !participants.some((member) => member.id === p.id)),
  );
  return {
    seed,
    participants,
    teams,
    operations,
    summary: {
      participants: 300,
      teams: 90,
      memberships: 300,
      operationalAdmins: operations.length,
      ownerActionsExercised: false,
      minTeamSize: Math.min(...teams.map((t) => t.members.length)),
      maxTeamSize: Math.max(...teams.map((t) => t.members.length)),
      teamSizeDistribution: sizes,
      assignmentSHA256,
    },
  };
}
export function fixtureImage(width, height) {
  const crc = (bytes) => {
    let value = 0xffffffff;
    for (const byte of bytes) {
      value ^= byte;
      for (let bit = 0; bit < 8; bit++)
        value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunk = (kind, data) => {
    const type = Buffer.from(kind),
      size = Buffer.alloc(4),
      check = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    check.writeUInt32BE(crc(Buffer.concat([type, data])));
    return Buffer.concat([size, type, data, check]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * (1 + width * 4) + 1 + x * 4;
      raw[i] = 30;
      raw[i + 1] = 130;
      raw[i + 2] = 90;
      raw[i + 3] = 255;
    }
  return (
    "data:image/png;base64," +
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]).toString("base64")
  );
}
const logo = fixtureImage(64, 64),
  banner = fixtureImage(160, 90);
export function projectPayload(team, attempt, variant = "normal") {
  return {
    projectName: `Synthetic Project ${team.index}`,
    problemSolution:
      "A synthetic local project used only for reproducible load diagnostics.",
    description: `Synthetic team ${team.index}, attempt ${attempt}, variant ${variant}. No live project, repository verification or API integration is claimed.`,
    github: `https://github.com/load300-synthetic/project-${team.index}`,
    demo: "",
    logo,
    banner,
    tools: "Synthetic fixture; no model call.",
    cerebrasIntegration: "no",
    attestation: true,
  };
}
export async function seedLoad300(db, fixture, basePolicy, now = new Date()) {
  const created = "2026-10-22T07:00:00.000Z",
    auditActor = fixture.operations[0].id;
  const policy = {
    ...basePolicy,
    submissionOpen: new Date(now.getTime() - 3600000).toISOString(),
    submissionClose: new Date(now.getTime() + 7200000).toISOString(),
    operationScopes: ["submissions", "checkin"],
    retentionNotice:
      "LOCAL LOAD FIXTURE ONLY: disposable synthetic records; remove temporary storage at test end.",
    confirmations: [
      ...new Set([...basePolicy.confirmations, "privacyRetention"]),
    ],
  };
  async function execute(statements) {
    for (let at = 0; at < statements.length; at += 40)
      await db.batch(
        statements
          .slice(at, at + 40)
          .map(([sql, ...values]) => db.prepare(sql).bind(...values)),
      );
  }
  await execute([
    [
      "INSERT INTO event_settings(id,policy,active,version) VALUES(1,?,1,1)",
      JSON.stringify(policy),
    ],
    ...fixture.operations.map((p) => [
      "INSERT INTO users(id,email,name,role,created_at) VALUES(?,?,?,?,?)",
      p.id,
      p.email,
      p.name,
      p.role,
      created,
    ]),
  ]);
  await execute(
    fixture.participants.flatMap((p) => [
      [
        "INSERT INTO users(id,email,name,role,created_at) VALUES(?,?,?,?,?)",
        p.id,
        p.email,
        p.name,
        "participant",
        created,
      ],
      [
        "INSERT INTO profiles(user_id,bio,gender,public) VALUES(?,?,?,0)",
        p.id,
        "Synthetic builder fixture; not a real attendee.",
        "non-binary",
      ],
      [
        "INSERT INTO participant_profiles(user_id,display_name,skills,completed_at,gender_confirmed) VALUES(?,?,?,?,1)",
        p.id,
        p.name,
        "Synthetic coding",
        created,
      ],
      [
        "INSERT INTO profile_details(user_id,phone,avatar_color,avatar_expression) VALUES(?,?,?,?)",
        p.id,
        "+12025550100",
        "blue",
        "squeezed",
      ],
      [
        "INSERT INTO registrations(email,status,luma_confirmed) VALUES(?,'approved',1)",
        p.email,
      ],
      [
        "INSERT INTO luma_roster(email,imported_by,imported_at) VALUES(?,?,?)",
        p.email,
        auditActor,
        created,
      ],
    ]),
  );
  await execute(
    fixture.teams.flatMap((t) => [
      [
        "INSERT INTO teams(id,name,leader_id,bio,created_at) VALUES(?,?,?,?,?)",
        t.id,
        t.name,
        t.leaderId,
        "Synthetic local fixture only.",
        created,
      ],
      ...t.members.map((id) => [
        "INSERT INTO memberships(user_id,team_id,joined_at) VALUES(?,?,?)",
        id,
        t.id,
        created,
      ]),
      [
        "INSERT INTO ideas(team_id,title,core,description,hash,updated_at) VALUES(?,?,?,?,?,?)",
        t.id,
        `Synthetic idea ${t.index}`,
        "Synthetic private core",
        "Synthetic private description",
        createHash("sha256").update(t.id).digest("hex"),
        created,
      ],
    ]),
  );
  await execute(
    fixture.participants.map((p) => [
      "INSERT INTO check_ins(user_id,actor_id,created_at) VALUES(?,?,?)",
      p.id,
      auditActor,
      created,
    ]),
  );
  return {
    policyWindow: {
      open: policy.submissionOpen,
      close: policy.submissionClose,
    },
    localOperationalPolicySeed: true,
    productionPolicyChanged: false,
    repositoryCutoffChanged: false,
    aiConfigured: false,
    creditsSeeded: false,
  };
}
