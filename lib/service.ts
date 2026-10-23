import { commitSha } from "./repository-evidence";
import { attendancePredicate, personStatus } from "./portal-status";
import {
  assertUnlockedTeam,
  requireSubmissionAccess,
  requireGoingForCheckin,
} from "./team-access";
import { validateProjectImage } from "./project-media";
import { qualifiedEngagement } from "./engagement-scoring";
import { z } from "zod";
import {
  assertPreviousWrite,
  batch,
  one,
  rows,
  type Database,
  type SQL,
} from "./db";
import { isOwner, type Identity } from "./identity";
import { PortalExperience } from "./experience";
import {
  demand,
  emailSchema,
  text,
  httpsUrl,
  githubUrl,
  sha256,
  seal,
  unseal,
  requireCreditKey,
  parseCSV,
  feedbackQuality,
  PortalError,
} from "./security";
import {
  operationalBlockers,
  operationEnabled,
  operationalDecisions,
  setupReadiness,
  type Operation,
  policySchema,
  policyBlockers,
  draftPolicy,
  type Policy,
} from "./policy";
import {
  disabledEvaluator,
  reportSchema,
  score,
  type Evaluator,
} from "./evaluation";
type User = { id: string; email: string; name: string; role: string };
type Team = { id: string; name: string; leader_id: string; bio: string };
type Settings = { policy: string; active: number; version: number };
type Version = {
  id: string;
  team_id: string;
  attempt: number;
  payload: string;
  created_at: string;
};
type Review = {
  team_id: string;
  version_id: string;
  eligibility: string;
  astra: number | null;
  codex: number | null;
  diversity: number | null;
  false_claims: number;
  evidence: string;
};
const id = text(200),
  reason = text(1000),
  number = z.coerce.number().finite();
const bool = z.preprocess(
  (v) => v === true || v === "true" || v === "on" || v === 1,
  z.boolean(),
);
const json = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);
const optionalUrl = z.union([httpsUrl, z.literal("")]).default("");
export class PortalService {
  constructor(
    public db: Database,
    public identity: Identity | null,
    public creditKey: string | undefined,
    public now: () => string = () => new Date().toISOString(),
    public evaluator: Evaluator = disabledEvaluator,
  ) {}
  async actor() {
    demand(this.identity, 401, "SIGN_IN_REQUIRED");
    const i = this.identity;
    await batch(this.db, [
      [
        "INSERT INTO users(id,email,name,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name WHERE users.email<>excluded.email OR users.name<>excluded.name",
        i.id,
        i.email,
        i.name,
        this.now(),
      ],
      [
        "INSERT INTO profiles(user_id) VALUES(?) ON CONFLICT(user_id) DO NOTHING",
        i.id,
      ],
    ]);
    const u = (await one<User>(
      this.db,
      "SELECT id,email,name,role FROM users WHERE id=?",
      i.id,
    ))!;
    const extra = await one<{ role: string; display_name: string | null }>(
      this.db,
      "SELECT COALESCE(r.role,u.role) role,p.display_name FROM users u LEFT JOIN portal_roles r ON r.user_id=u.id LEFT JOIN participant_profiles p ON p.user_id=u.id WHERE u.id=?",
      i.id,
    );
    return {
      ...u,
      role: extra?.role || u.role,
      name: extra?.display_name || u.name,
      owner: isOwner(i),
    };
  }
  async staff(ownerOnly = false) {
    const u = await this.actor();
    demand(
      u.owner || (!ownerOnly && u.role === "admin"),
      403,
      ownerOnly ? "OWNER_REQUIRED" : "ADMIN_REQUIRED",
    );
    return u;
  }
  async approved() {
    const u = await this.actor();
    demand(
      await one(
        this.db,
        "SELECT email FROM registrations WHERE email=? AND status='approved'",
        u.email,
      ),
      403,
      "APPROVAL_REQUIRED",
    );
    return u;
  }
  async settings(allowUninitializedView = false) {
    const s = (await one<Settings>(
      this.db,
      "SELECT * FROM event_settings WHERE id=1",
    ))!;
    // Rendering sign-in/profile/admin setup must not require activating or
    // implicitly initializing an event. Commands retain the default strict path.
    if (!s && allowUninitializedView)
      return { active: 0, version: 0, policy: draftPolicy };
    demand(
      s,
      409,
      "EVENT_SETUP_REQUIRED",
      "Event setup is pending. Drafts and profiles remain available; the owner can initialize the event without opening operations.",
    );
    return { ...s, policy: policySchema.parse(JSON.parse(s.policy)) };
  }
  audit(
    actor: string,
    action: string,
    entity: string,
    detail: unknown = {},
    why = "User initiated",
  ): SQL {
    return [
      "INSERT INTO audit_logs VALUES(?,?,?,?,?,?,?)",
      crypto.randomUUID(),
      actor,
      action,
      entity,
      JSON.stringify(detail),
      why,
      this.now(),
    ];
  }
  async mutate(
    actor: string,
    action: string,
    entity: string,
    sql: SQL[],
    detail: unknown = {},
    why = "User initiated",
  ) {
    return batch(this.db, [
      ...sql,
      this.audit(actor, action, entity, detail, why),
    ]);
  }
  async team(userId: string) {
    return one<Team>(
      this.db,
      "SELECT t.* FROM teams t JOIN memberships m ON m.team_id=t.id WHERE m.user_id=?",
      userId,
    );
  }
  async lead() {
    const u = await this.approved(),
      t = await this.team(u.id);
    demand(t && t.leader_id === u.id, 403, "LEADER_REQUIRED");
    return { u, t };
  }
  async unfrozen() {
    demand(
      !(await one(this.db, "SELECT id FROM result_snapshots LIMIT 1")),
      409,
      "RESULTS_FROZEN",
    );
  }
  async live() {
    const s = await this.settings(true);
    demand(
      s.version > 0 && s.active && policyBlockers(s.policy).length === 0,
      409,
      "POLICIES_UNCONFIRMED",
      "Scoring setup is incomplete. Operational submissions and check-in have separate readiness checks.",
    );
    return s;
  }
  async operational(operation: Operation) {
    const s = await this.settings(true),
      status = setupReadiness(s, this.now())[operation];
    demand(
      status.configured && status.enabled,
      409,
      operation === "submissions"
        ? "SUBMISSIONS_NOT_ENABLED"
        : "CHECKIN_POLICY_UNCONFIRMED",
      status.message,
    );
    return s;
  }
  async throttle(u: string) {
    const window = Math.floor(Date.parse(this.now()) / 60000);
    try {
      await batch(this.db, [
        [
          "INSERT INTO request_buckets VALUES(?,?,1) ON CONFLICT(actor_id,window) DO UPDATE SET count=count+1",
          u,
          window,
        ],
        ["DELETE FROM request_buckets WHERE window<?", window - 5],
      ]);
    } catch {
      throw new PortalError(
        429,
        "RATE_LIMIT",
        "Please wait before trying again.",
      );
    }
  }
  async command(
    action: string,
    data: unknown,
  ): Promise<Record<string, unknown>> {
    const actor = await this.actor();
    await this.throttle(actor.id);
    const revised = await new PortalExperience(this).command(
      action,
      data,
      actor,
    );
    if (revised !== null) return revised;
    if (
      [
        "create-team",
        "team-request",
        "team-invite",
        "team-respond",
        "remove-member",
        "idea",
        "submit",
      ].includes(action)
    )
      await new PortalExperience(this).completed(actor);
    switch (action) {
      case "initialize-event": {
        await this.staff(true);
        const d = z.object({ reason }).strict().parse(data);
        demand(
          !(await one(this.db, "SELECT id FROM event_settings WHERE id=1")),
          409,
          "EVENT_ALREADY_INITIALIZED",
        );
        await this.mutate(
          actor.id,
          action,
          "1",
          [
            [
              "INSERT INTO event_settings(id,policy) VALUES(1,?)",
              JSON.stringify(draftPolicy),
            ],
          ],
          { active: false },
          d.reason,
        );
        return {
          message:
            "Draft event initialized. Policy confirmation is still required.",
        };
      }
      case "profile": {
        const d = z
          .object({
            bio: z.string().max(2000).optional(),
            socials: z.string().max(12000).optional(),
            gender: z
              .enum([
                "woman",
                "man",
                "non-binary",
                "self-described",
                "prefer-not-to-say",
              ])
              .optional(),
            genderDescription: z.string().max(100).optional(),
            public: bool.optional(),
          })
          .parse(data);
        const old = (await one<{
          bio: string;
          socials: string;
          gender: string;
          gender_description: string;
          public: number;
        }>(this.db, "SELECT * FROM profiles WHERE user_id=?", actor.id))!;
        const socials = (
          d.socials ?? (JSON.parse(old.socials) as string[]).join("\n")
        )
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
        demand(socials.length <= 8, 422, "TOO_MANY_SOCIALS");
        socials.forEach((u) => httpsUrl.parse(u));
        await this.mutate(
          actor.id,
          action,
          actor.id,
          [
            [
              "UPDATE profiles SET bio=?,socials=?,gender=?,gender_description=?,public=? WHERE user_id=?",
              d.bio ?? old.bio,
              JSON.stringify(socials),
              d.gender ?? old.gender,
              d.genderDescription ?? old.gender_description,
              d.public === undefined ? old.public : d.public ? 1 : 0,
              actor.id,
            ],
          ],
          { public: d.public, fields: ["bio", "socials", "gender"] },
        );
        return { message: "Profile saved. Gender remains private." };
      }
      case "create-team": {
        const u = await this.approved();
        const d = z
          .object({ name: text(80), bio: z.string().max(1000).default("") })
          .parse(data);
        demand(!(await this.team(u.id)), 409, "ALREADY_IN_TEAM");
        const teamId = crypto.randomUUID();
        await this.mutate(
          u.id,
          action,
          teamId,
          [
            [
              "INSERT INTO teams VALUES(?,?,?,?,?)",
              teamId,
              d.name,
              u.id,
              d.bio,
              this.now(),
            ],
            ["INSERT INTO memberships VALUES(?,?,?)", u.id, teamId, this.now()],
          ],
          { name: d.name },
        );
        return { id: teamId };
      }
      case "team-request":
      case "team-invite": {
        const u = await this.approved();
        const d = z
          .object({ teamId: id, email: emailSchema.optional() })
          .parse(data);
        const t = await one<Team>(
          this.db,
          "SELECT * FROM teams WHERE id=?",
          d.teamId,
        );
        demand(t, 404, "TEAM_NOT_FOUND");
        const s = await this.settings();
        demand(
          this.now() < s.policy.membershipFreeze,
          409,
          "MEMBERSHIP_FROZEN",
        );
        let target = u.id;
        if (action === "team-invite") {
          demand(t.leader_id === u.id, 403, "LEADER_REQUIRED");
          demand(d.email, 422, "EMAIL_REQUIRED");
          const invited = await one<User>(
            this.db,
            "SELECT u.* FROM users u JOIN registrations r ON r.email=u.email WHERE u.email=? AND r.status='approved'",
            d.email,
          );
          demand(invited, 422, "REGISTERED_ACCOUNT_REQUIRED");
          target = invited.id;
        }
        demand(!(await this.team(target)), 409, "ALREADY_IN_TEAM");
        const requestId = crypto.randomUUID();
        await this.mutate(u.id, action, d.teamId, [
          [
            "INSERT INTO team_actions VALUES(?,?,?,?,?,?)",
            requestId,
            d.teamId,
            target,
            action === "team-request" ? "request" : "invite",
            "pending",
            this.now(),
          ],
        ]);
        return { message: "Saved in portal. No email sent." };
      }
      case "team-respond": {
        await this.approved();
        const d = z
          .object({ id, decision: z.enum(["accepted", "declined"]) })
          .parse(data);
        const a = await one<{
          id: string;
          team_id: string;
          user_id: string;
          kind: string;
          status: string;
          leader_id: string;
        }>(
          this.db,
          "SELECT a.*,t.leader_id FROM team_actions a JOIN teams t ON t.id=a.team_id WHERE a.id=?",
          d.id,
        );
        demand(a && a.status === "pending", 409, "REQUEST_NOT_PENDING");
        demand(
          a.kind === "invite"
            ? a.user_id === actor.id
            : a.leader_id === actor.id,
          403,
          "FORBIDDEN",
        );
        const s = await this.settings();
        demand(
          this.now() < s.policy.membershipFreeze,
          409,
          "MEMBERSHIP_FROZEN",
        );
        const statements: SQL[] = [
          [
            "UPDATE team_actions SET status=? WHERE id=? AND status='pending'",
            d.decision,
            d.id,
          ],
        ];
        if (d.decision === "accepted")
          statements.push([
            "INSERT INTO memberships VALUES(?,?,?)",
            a.user_id,
            a.team_id,
            this.now(),
          ]);
        await this.mutate(actor.id, action, a.team_id, statements, {
          decision: d.decision,
        });
        return { message: "Team response saved." };
      }
      case "remove-member": {
        const { u, t } = await this.lead();
        await assertUnlockedTeam(this, t.id);
        const d = z.object({ userId: id }).parse(data);
        demand(d.userId !== t.leader_id, 409, "CANNOT_REMOVE_LEADER");
        demand(
          this.now() < (await this.settings()).policy.membershipFreeze,
          409,
          "MEMBERSHIP_FROZEN",
        );
        await this.mutate(
          u.id,
          action,
          t.id,
          [
            [
              "DELETE FROM memberships WHERE team_id=? AND user_id=?",
              t.id,
              d.userId,
            ],
          ],
          { userId: d.userId },
        );
        return {};
      }
      case "idea": {
        demand(
          this.now() < (await this.settings(true)).policy.ideaLock,
          409,
          "IDEA_LOCKED",
        );
        const { u, t } = await this.lead();
        const d = z
          .object({
            title: text(120),
            core: text(2000),
            description: text(6000),
          })
          .parse(data);
        const hash = await sha256(
          JSON.stringify({ title: d.title, core: d.core }),
        );
        const old = await one(
          this.db,
          "SELECT title,core,hash FROM ideas WHERE team_id=?",
          t.id,
        );
        await this.mutate(
          u.id,
          action,
          t.id,
          [
            [
              "INSERT INTO ideas VALUES(?,?,?,?,?,?) ON CONFLICT(team_id) DO UPDATE SET title=excluded.title,core=excluded.core,description=excluded.description,hash=excluded.hash,updated_at=excluded.updated_at",
              t.id,
              d.title,
              d.core,
              d.description,
              hash,
              this.now(),
            ],
            [
              "INSERT INTO idea_revisions VALUES(?,?,?,?)",
              crypto.randomUUID(),
              t.id,
              JSON.stringify({ ...d, hash, author: u.id }),
              this.now(),
            ],
          ],
          { before: old || null, after: { title: d.title, hash } },
        );
        return { message: "Idea saved with immutable revision history." };
      }
      case "registration": {
        await this.staff();
        const d = z
          .object({
            email: emailSchema,
            status: z.enum(["pending", "approved", "rejected", "cancelled"]),
            lumaConfirmed: bool.default(false),
            reason,
          })
          .parse(data);
        const old = await one(
          this.db,
          "SELECT * FROM registrations WHERE email=?",
          d.email,
        );
        await this.mutate(
          actor.id,
          action,
          d.email,
          [
            [
              "INSERT INTO registrations VALUES(?,?,?) ON CONFLICT(email) DO UPDATE SET status=excluded.status,luma_confirmed=excluded.luma_confirmed",
              d.email,
              d.status,
              d.lumaConfirmed ? 1 : 0,
            ],
          ],
          {
            before: old || null,
            after: { status: d.status, lumaConfirmed: d.lumaConfirmed },
          },
          d.reason,
        );
        return {};
      }
      case "role": {
        await this.staff(true);
        const d = z
          .object({
            userId: id,
            role: z.enum(["participant", "admin", "judge"]),
            reason,
          })
          .parse(data);
        const target = await one<User>(
          this.db,
          "SELECT * FROM users WHERE id=?",
          d.userId,
        );
        demand(target, 404, "ACCOUNT_NOT_FOUND");
        demand(
          target.email !== "connectwithparam.30@gmail.com" &&
            !(
              this.identity?.source === "local-test" &&
              target.id === "fake_owner"
            ),
          403,
          "OWNER_PERMANENT",
        );
        await this.mutate(
          actor.id,
          action,
          d.userId,
          [["UPDATE users SET role=? WHERE id=?", d.role, d.userId]],
          { before: target.role, after: d.role },
          d.reason,
        );
        return {};
      }
      case "assign-judge": {
        await this.staff(true);
        const d = z.object({ judgeId: id, teamId: id, reason }).parse(data);
        demand(
          await one(
            this.db,
            "SELECT id FROM users WHERE id=? AND role='judge'",
            d.judgeId,
          ),
          422,
          "JUDGE_REQUIRED",
        );
        demand(
          !(await one(
            this.db,
            "SELECT user_id FROM memberships WHERE user_id=? AND team_id=?",
            d.judgeId,
            d.teamId,
          )),
          409,
          "JUDGE_CONFLICT",
        );
        await this.mutate(
          actor.id,
          action,
          d.teamId,
          [
            [
              "INSERT INTO judge_assignments VALUES(?,?) ON CONFLICT DO NOTHING",
              d.judgeId,
              d.teamId,
            ],
          ],
          { judgeId: d.judgeId },
          d.reason,
        );
        return {};
      }
      case "check-in": {
        await this.staff();
        await this.operational("checkin");
        const d = z.object({ userId: id, reason }).parse(data);
        await requireGoingForCheckin(this, d.userId);
        await this.mutate(
          actor.id,
          action,
          d.userId,
          [
            [
              "INSERT INTO check_ins VALUES(?,?,?) ON CONFLICT(user_id) DO NOTHING",
              d.userId,
              actor.id,
              this.now(),
            ],
            [
              "DELETE FROM participant_status_overrides WHERE user_id=?",
              d.userId,
            ],
          ],
          {},
          d.reason,
        );
        if (!this.creditKey)
          return {
            message: "Checked in. Credit allocation is not configured yet.",
          };
        return this.allocate(d.userId, actor.id);
      }
      case "allocate": {
        await this.staff();
        const d = z.object({ userId: id }).parse(data);
        return this.allocate(d.userId, actor.id);
      }
      case "credit-type": {
        await this.staff();
        const d = z
          .object({ name: text(100), instructions: text(4000) })
          .parse(data);
        const typeId = crypto.randomUUID();
        await this.mutate(
          actor.id,
          action,
          typeId,
          [
            [
              "INSERT INTO credit_types VALUES(?,?,?,1)",
              typeId,
              d.name,
              d.instructions,
            ],
          ],
          { name: d.name },
        );
        return { id: typeId };
      }
      case "update-credit-instructions": {
        await this.staff();
        const d = z
          .object({
            typeId: id,
            markdown: z.string().max(10000),
            reason: text(1000).min(5),
          })
          .strict()
          .parse(data);
        demand(
          await one(
            this.db,
            "SELECT id FROM credit_types WHERE id=?",
            d.typeId,
          ),
          404,
          "CREDIT_TYPE_REQUIRED",
        );
        await this.mutate(
          actor.id,
          action,
          d.typeId,
          [
            [
              "UPDATE credit_types SET instructions=? WHERE id=?",
              d.markdown,
              d.typeId,
            ],
          ],
          { fields: ["instructions"], sha256: await sha256(d.markdown) },
          d.reason,
        );
        return {
          message:
            "Shared setup instructions updated. Personal credits are unchanged.",
        };
      }
      case "reveal-credit": {
        await this.approved();
        demand(actor.role !== "judge", 403, "JUDGES_CANNOT_ACCESS_CREDITS");
        demand(
          await one(
            this.db,
            `SELECT id FROM users WHERE id=? AND ${attendancePredicate("users.id")}`,
            actor.id,
          ),
          403,
          "CHECKIN_REQUIRED",
        );
        requireCreditKey(this.creditKey);
        const d = z.object({ typeId: id }).strict().parse(data);
        const c = await one<{ ciphertext: string }>(
          this.db,
          `SELECT i.ciphertext FROM credit_allocations a JOIN credit_inventory i ON i.id=a.inventory_id JOIN users u ON u.id=a.user_id WHERE ${attendancePredicate("a.user_id")} AND a.user_id=? AND a.type_id=? AND lower(a.recipient_email)=? AND lower(u.email)=?`,
          actor.id,
          d.typeId,
          actor.email.toLowerCase(),
          actor.email.toLowerCase(),
        );
        demand(c, 404, "ALLOCATION_PENDING");
        await this.mutate(actor.id, action, d.typeId, []);
        return { value: await unseal(c.ciphertext, this.creditKey) };
      }
      case "preview-import":
      case "commit-import": {
        await this.staff();
        const d = z
          .object({
            kind: z.enum(["roster", "credits"]),
            csv: text(512000),
            typeId: z.string().default(""),
            digest: z.string().optional(),
          })
          .parse(data);
        if (d.kind === "credits") requireCreditKey(this.creditKey);
        const parsed = parseCSV(d.csv);
        demand(
          parsed[0].length === 1 &&
            parsed[0][0] === (d.kind === "roster" ? "email" : "value"),
          422,
          "CSV_HEADER_EXPECTED",
          d.kind === "roster"
            ? "Use a single email column."
            : "Use a single value column.",
        );
        const values = parsed.slice(1).map((r) => r[0]);
        if (d.kind === "roster") values.forEach((v) => emailSchema.parse(v));
        else {
          demand(
            await one(
              this.db,
              "SELECT id FROM credit_types WHERE id=?",
              d.typeId,
            ),
            422,
            "CREDIT_TYPE_REQUIRED",
          );
          demand(
            values.every((v) => v.length > 0 && v.length <= 4000),
            422,
            "INVALID_CREDIT_VALUE",
          );
        }
        const normalized =
          d.kind === "roster"
            ? values.map((v) => v.toLowerCase().trim())
            : values;
        demand(
          new Set(normalized).size === normalized.length,
          422,
          "CSV_DUPLICATES",
        );
        const digest = await sha256(
          JSON.stringify({ kind: d.kind, type: d.typeId, values: normalized }),
        );
        if (action === "preview-import") {
          await this.mutate(
            actor.id,
            action,
            digest,
            [
              [
                "INSERT INTO import_previews VALUES(?,?,?) ON CONFLICT(actor_id,digest) DO UPDATE SET created_at=excluded.created_at",
                actor.id,
                digest,
                this.now(),
              ],
            ],
            { kind: d.kind, count: values.length },
          );
          return {
            digest,
            rows: normalized.map((v, i) =>
              d.kind === "roster"
                ? { row: i + 1, email: v }
                : {
                    row: i + 1,
                    value: "[masked]",
                    fingerprint: "…" + digest.slice(-8),
                  },
            ),
          };
        }
        demand(
          d.digest === digest &&
            (await one(
              this.db,
              "SELECT digest FROM import_previews WHERE actor_id=? AND digest=? AND created_at>?",
              actor.id,
              digest,
              new Date(Date.parse(this.now()) - 15 * 60000).toISOString(),
            )),
          409,
          "PREVIEW_REQUIRED",
        );
        const sql: SQL[] = [];
        if (d.kind === "roster")
          sql.push([
            "INSERT INTO registrations(email) SELECT value FROM json_each(?) WHERE true ON CONFLICT(email) DO NOTHING",
            JSON.stringify(normalized),
          ]);
        else {
          const inventory = await Promise.all(
            normalized.map(async (value) => ({
              id: crypto.randomUUID(),
              ciphertext: await seal(value, this.creditKey),
              fingerprint: await sha256(value),
            })),
          );
          sql.push([
            "INSERT INTO credit_inventory SELECT json_extract(value,'$.id'),?,json_extract(value,'$.ciphertext'),json_extract(value,'$.fingerprint'),? FROM json_each(?)",
            d.typeId,
            this.now(),
            JSON.stringify(inventory),
          ]);
        }
        sql.push([
          "DELETE FROM import_previews WHERE actor_id=? AND digest=?",
          actor.id,
          digest,
        ]);
        await this.mutate(actor.id, action, digest, sql, {
          kind: d.kind,
          count: values.length,
        });
        return { message: "Import committed." };
      }
      case "settings": {
        await this.staff(true);
        const d = z.object({ policy: z.unknown(), reason }).parse(data);
        const old = await this.settings();
        await this.unfrozen();
        const p = policySchema.parse(json(d.policy));
        if (old.active) {
          const protectedKeys = [
            "timezone",
            "ideaLock",
            "membershipFreeze",
            "ideaReveal",
            "submissionOpen",
            "submissionClose",
            "deploymentRule",
            "lumaRequired",
            "retentionNotice",
            "capacityRule",
            "capacity",
            "teamFormationRule",
            "operationScopes",
            "weights",
          ] as const;
          demand(
            protectedKeys.every(
              (key) =>
                JSON.stringify(p[key]) === JSON.stringify(old.policy[key]),
            ) &&
              operationalDecisions.every(
                (key) =>
                  !old.policy.confirmations.includes(key) ||
                  p.confirmations.includes(key),
              ),
            409,
            "ACTIVE_OPERATION_POLICY_PROTECTED",
            "Enabled operational rules cannot be changed through judging setup. Use the dedicated deadline or global-weight preview controls.",
          );
        }
        const oldQualification = old.policy.engagementQualification,
          newQualification = p.engagementQualification;
        if (
          oldQualification &&
          newQualification &&
          (JSON.stringify(oldQualification) !==
            JSON.stringify(newQualification) ||
            [
              "feedbackMin",
              "feedbackMax",
              "engagementOpen",
              "engagementClose",
            ].some(
              (key) =>
                old.policy[key as keyof typeof old.policy] !==
                p[key as keyof typeof p],
            ))
        )
          demand(
            newQualification.version > oldQualification.version,
            409,
            "QUALIFICATION_VERSION_REQUIRED",
          );
        await this.mutate(
          actor.id,
          action,
          "event",
          [
            [
              "UPDATE event_settings SET policy=?,version=version+1 WHERE id=1 AND version=?",
              JSON.stringify(p),
              old.version,
            ],
            ...assertPreviousWrite(),
          ],
          { before: old.policy, after: p },
          d.reason,
        );
        return { blockers: policyBlockers(p) };
      }
      case "activate-operations": {
        await this.staff(true);
        await this.unfrozen();
        const d = z
          .object({
            operation: z.enum(["submissions", "checkin"]),
            version: z.number().int().min(1),
            confirmation: z.string(),
            reason: text(1000).min(5),
          })
          .strict()
          .parse(data);
        demand(
          d.confirmation ===
            (d.operation === "submissions"
              ? "ENABLE_SUBMISSIONS"
              : "ENABLE_CHECKIN"),
          422,
          "EXPLICIT_OPERATION_CONFIRMATION_REQUIRED",
        );
        const s = await this.settings(true);
        demand(s.version === d.version, 409, "POLICY_CHANGED_RELOAD");
        const blockers = operationalBlockers(s.policy, d.operation);
        demand(
          blockers.length === 0,
          409,
          "OPERATION_POLICY_UNCONFIRMED",
          blockers.join(", "),
        );
        if (operationEnabled(s, d.operation))
          return { message: "This operation is already enabled." };
        const p = {
          ...s.policy,
          operationScopes: [
            ...new Set([
              ...(s.active
                ? s.policy.operationScopes ||
                  (["submissions", "checkin"] as const)
                : []),
              d.operation,
            ]),
          ],
        };
        const serialized = JSON.stringify(p);
        const result = await this.mutate(
          actor.id,
          action,
          d.operation,
          [
            [
              "UPDATE event_settings SET active=1,policy=?,version=version+1 WHERE id=1 AND version=? AND NOT EXISTS(SELECT 1 FROM result_snapshots)",
              serialized,
              d.version,
            ],
            ...assertPreviousWrite(),
            [
              "INSERT INTO event_policy_history VALUES(?,?,?,?,?)",
              s.version + 1,
              serialized,
              actor.id,
              this.now(),
              d.reason,
            ],
          ],
          { operation: d.operation, policyVersion: s.version + 1 },
          d.reason,
        );
        // D1 meta.changes may include trigger writes; the transactional
        // assertPreviousWrite() above checks the direct UPDATE and rolls back
        // stale writes together with history/audit rows.
        return {
          message:
            d.operation === "submissions"
              ? "Submission operations enabled. Scoring remains separately gated."
              : "Check-in operations enabled. Scoring remains separately gated.",
        };
      }
      case "activate": {
        await this.staff(true);
        const d = z.object({ reason }).parse(data);
        const s = await this.settings();
        demand(
          policyBlockers(s.policy).length === 0,
          409,
          "POLICIES_UNCONFIRMED",
          policyBlockers(s.policy).join(", "),
        );
        const activatedPolicy = {
          ...s.policy,
          operationScopes: ["submissions", "checkin"] as Operation[],
        };
        const activation = await this.mutate(
          actor.id,
          action,
          "event",
          [
            [
              "UPDATE event_settings SET active=1,policy=?,version=version+1 WHERE id=1 AND active=0 AND version=?",
              JSON.stringify(activatedPolicy),
              s.version,
            ],
            ...assertPreviousWrite(),
          ],
          { policyVersion: s.version + 1 },
          d.reason,
        );
        return {};
      }
      case "submit": {
        const legacyTeam = await this.team(actor.id);
        demand(
          !legacyTeam ||
            !(await one(
              this.db,
              "SELECT id FROM projects WHERE team_id=?",
              legacyTeam.id,
            )),
          409,
          "USE_SHARED_PROJECT_SUBMISSION",
        );
        await this.unfrozen();
        const { u, t } = await this.lead();
        await requireSubmissionAccess(this, t.id);
        const d = z
          .object({
            projectName: text(120),
            logo: z.string().max(180000),
            banner: z.string().max(180000),
            problemSolution: text(500),
            description: text(6000),
            github: githubUrl,
            commitSha,
            demo: optionalUrl,
            video: optionalUrl,
            gtm: text(3000),
            features: text(4000),
            tools: text(2000),
            toolEffectiveness: text(3000),
            contributions: z.unknown(),
            openaiClaim: bool,
            cerebrasClaim: bool,
            openaiEvidence: z.string().max(4000).default(""),
            cerebrasEvidence: z.string().max(4000).default(""),
            attestation: bool,
          })
          .parse(data);
        validateProjectImage(d.logo, "logo");
        validateProjectImage(d.banner, "banner");
        demand(d.attestation, 422, "ATTESTATION_REQUIRED");
        const members = await rows<{ user_id: string }>(
          this.db,
          "SELECT user_id FROM memberships WHERE team_id=?",
          t.id,
        );
        const contributions = z
          .array(z.object({ userId: id, role: text(2000), codex: text(2000) }))
          .min(1)
          .max(5)
          .parse(json(d.contributions));
        demand(
          contributions.length === members.length &&
            new Set(contributions.map((c) => c.userId)).size ===
              members.length &&
            members.every((m) =>
              contributions.some((c) => c.userId === m.user_id),
            ),
          422,
          "ALL_MEMBER_CONTRIBUTIONS_REQUIRED",
        );
        demand(
          !d.openaiClaim || d.openaiEvidence.trim().length >= 20,
          422,
          "OPENAI_EVIDENCE_REQUIRED",
        );
        demand(
          !d.cerebrasClaim || d.cerebrasEvidence.trim().length >= 20,
          422,
          "CEREBRAS_EVIDENCE_REQUIRED",
        );
        demand(
          await one(this.db, "SELECT team_id FROM ideas WHERE team_id=?", t.id),
          409,
          "IDEA_REQUIRED",
        );
        const requestKey = await sha256(
          JSON.stringify({ ...d, contributions }),
        );
        const prior = await one<{ id: string }>(
          this.db,
          "SELECT id FROM submission_versions WHERE team_id=? AND json_extract(payload,'$._requestKey')=?",
          t.id,
          requestKey,
        );
        if (prior)
          return {
            id: prior.id,
            message: "This submission was already committed.",
          };
        const versionId = crypto.randomUUID();
        try {
          await this.mutate(
            u.id,
            action,
            t.id,
            [
              [
                "INSERT INTO submission_versions SELECT ?,?,COALESCE(MAX(attempt),0)+1,?,? FROM submission_versions WHERE team_id=?",
                versionId,
                t.id,
                JSON.stringify({
                  ...d,
                  contributions,
                  _requestKey: requestKey,
                }),
                this.now(),
                t.id,
              ],
              [
                "INSERT INTO astra_jobs(id,version_id,updated_at) VALUES(?,?,?)",
                crypto.randomUUID(),
                versionId,
                this.now(),
              ],
            ],
            { versionId },
          );
        } catch (error) {
          const prior = await one<{ id: string }>(
            this.db,
            "SELECT id FROM submission_versions WHERE team_id=? AND json_extract(payload,'$._requestKey')=?",
            t.id,
            requestKey,
          );
          if (prior)
            return {
              id: prior.id,
              message: "This submission was already committed.",
            };
          throw error;
        }
        return {
          id: versionId,
          message: "Submission committed.",
        };
      }
      case "vote":
      case "feedback": {
        await this.unfrozen();
        const s = await this.live();
        const u = await this.approved();
        const d = z
          .object({ teamId: id, text: z.string().optional() })
          .parse(data);
        demand(
          s.policy.engagementOpen &&
            s.policy.engagementClose &&
            this.now() >= s.policy.engagementOpen &&
            this.now() < s.policy.engagementClose,
          409,
          "ENGAGEMENT_CLOSED",
        );
        demand(
          await one(
            this.db,
            "SELECT user_id FROM check_ins WHERE user_id=?",
            u.id,
          ),
          403,
          "CHECKIN_REQUIRED",
        );
        demand(
          !(await one(
            this.db,
            "SELECT user_id FROM memberships WHERE user_id=? AND team_id=?",
            u.id,
            d.teamId,
          )),
          403,
          "OWN_TEAM",
        );
        demand(
          await one(
            this.db,
            "SELECT id FROM submission_versions WHERE team_id=?",
            d.teamId,
          ),
          404,
          "PROJECT_NOT_FOUND",
        );
        if (action === "vote") {
          await this.mutate(u.id, action, d.teamId, [
            ["INSERT INTO votes VALUES(?,?,?)", u.id, d.teamId, this.now()],
          ]);
        } else {
          const value = d.text?.trim() || "";
          demand(
            feedbackQuality(value, s.policy.feedbackMin, s.policy.feedbackMax),
            422,
            "FEEDBACK_TOO_GENERIC",
            "Give a specific observation: what worked, what failed, and what could improve.",
          );
          const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, "");
          const prior = await rows<{ text: string; team_id: string }>(
            this.db,
            "SELECT text,team_id FROM feedback WHERE author_id=?",
            u.id,
          );
          demand(
            !prior.some(
              (r) =>
                r.team_id !== d.teamId &&
                similarity(
                  normalized,
                  r.text.toLowerCase().replace(/[^a-z0-9]/g, ""),
                ) > 0.85,
            ),
            422,
            "DUPLICATE_FEEDBACK",
          );
          await this.mutate(u.id, action, d.teamId, [
            [
              "INSERT INTO feedback(author_id,team_id,text,updated_at) VALUES(?,?,?,?) ON CONFLICT(author_id,team_id) DO UPDATE SET text=excluded.text,valid=0,moderation_reason='Edited: needs staff review',updated_at=excluded.updated_at",
              u.id,
              d.teamId,
              value,
              this.now(),
            ],
          ]);
        }
        return {};
      }
      case "judge-score": {
        await this.unfrozen();
        const s = await this.live();
        const d = z
          .object({
            teamId: id,
            rating: number.min(0).max(10),
            notes: z.string().max(4000).default(""),
          })
          .parse(data);
        demand(actor.role === "judge", 403, "JUDGE_REQUIRED");
        demand(
          s.policy.judgingClose &&
            this.now() >= s.policy.submissionClose! &&
            this.now() < s.policy.judgingClose,
          409,
          "JUDGING_CLOSED",
        );
        demand(
          await one(
            this.db,
            "SELECT team_id FROM judge_assignments WHERE judge_id=? AND team_id=?",
            actor.id,
            d.teamId,
          ),
          403,
          "ASSIGNMENT_REQUIRED",
        );
        demand(
          !(await one(
            this.db,
            "SELECT user_id FROM memberships WHERE user_id=? AND team_id=?",
            actor.id,
            d.teamId,
          )),
          403,
          "JUDGE_CONFLICT",
        );
        await this.mutate(
          actor.id,
          action,
          d.teamId,
          [
            [
              "INSERT INTO human_scores VALUES(?,?,?,?,?) ON CONFLICT(judge_id,team_id) DO UPDATE SET rating=excluded.rating,notes=excluded.notes,updated_at=excluded.updated_at",
              actor.id,
              d.teamId,
              d.rating,
              d.notes,
              this.now(),
            ],
          ],
          { rating: d.rating },
        );
        return {};
      }
      case "astra-run": {
        await this.staff();
        await this.unfrozen();
        const d = z.object({ jobId: id }).parse(data);
        const j = await one<{
          id: string;
          version_id: string;
          state: string;
          attempts: number;
          payload: string;
        }>(
          this.db,
          "SELECT j.*,v.payload FROM astra_jobs j JOIN submission_versions v ON v.id=j.version_id WHERE j.id=?",
          d.jobId,
        );
        demand(
          j &&
            ["pending", "failed_retryable", "needs_review"].includes(j.state) &&
            j.attempts < 3,
          409,
          "JOB_NOT_RUNNABLE",
        );
        demand(
          this.now() >= (await this.settings()).policy.submissionClose!,
          409,
          "SUBMISSION_WINDOW_OPEN",
        );
        const claim = await batch(this.db, [
          [
            "UPDATE astra_jobs SET state='running',attempts=attempts+1,updated_at=? WHERE id=? AND state=?",
            this.now(),
            j.id,
            j.state,
          ],
        ]);
        demand(claim[0].meta?.changes === 1, 409, "JOB_ALREADY_CLAIMED");
        try {
          const report = reportSchema.parse(
            await this.evaluator.evaluate(j.version_id, JSON.parse(j.payload)),
          );
          demand(
            report.versionId === j.version_id,
            422,
            "REPORT_VERSION_MISMATCH",
          );
          await this.mutate(
            actor.id,
            action,
            j.id,
            [
              [
                "UPDATE astra_jobs SET state='needs_review',report=?,error=NULL,updated_at=? WHERE id=?",
                JSON.stringify(report),
                this.now(),
                j.id,
              ],
            ],
            { state: "needs_review" },
          );
          return {
            message:
              "Report stored. Human review required; no automatic deductions.",
          };
        } catch {
          await this.mutate(
            actor.id,
            action,
            j.id,
            [
              [
                "UPDATE astra_jobs SET state='failed_retryable',error='Evaluation unavailable or invalid output',updated_at=? WHERE id=?",
                this.now(),
                j.id,
              ],
            ],
            { state: "failed_retryable" },
          );
          return {
            message:
              "Evaluation unavailable. Submission preserved; retry or use approved fallback.",
          };
        }
      }
      case "review": {
        await this.staff();
        await this.unfrozen();
        await this.live();
        const d = z
          .object({
            teamId: id,
            versionId: id,
            eligibility: z.enum(["eligible", "ineligible", "needs_review"]),
            astra: number.min(0).max(30).nullable(),
            violation: z
              .object({ rule: text(1000).min(5), evidence: text(3000).min(10) })
              .strict()
              .optional(),
            codex: number.min(0).max(5),
            diversity: number.min(0).max(10),
            falseClaims: number.int().min(0).max(2),
            evidence: text(10000),
            reason,
          })
          .parse(data);
        const latest = await one<Version>(
          this.db,
          "SELECT * FROM submission_versions WHERE team_id=? ORDER BY attempt DESC LIMIT 1",
          d.teamId,
        );
        demand(latest?.id === d.versionId, 409, "STALE_SUBMISSION");
        demand(
          d.eligibility !== "ineligible" ||
            !!d.violation ||
            !!(await one(
              this.db,
              "SELECT e.project_id FROM project_eligibility e JOIN projects p ON p.id=e.project_id WHERE p.team_id=? AND e.version_id=? AND e.status='ineligible'",
              d.teamId,
              d.versionId,
            )),
          422,
          "ESTABLISHED_VIOLATION_REQUIRED",
        );
        const claims = JSON.parse(latest.payload);
        demand(
          d.falseClaims <=
            Number(!!claims.openaiClaim) + Number(!!claims.cerebrasClaim),
          422,
          "NO_UNCLAIMED_API_PENALTIES",
        );
        const s = await this.settings();
        demand(
          this.now() >= s.policy.submissionClose!,
          409,
          "SUBMISSION_WINDOW_OPEN",
        );
        demand(
          !d.falseClaims || s.policy.penaltyApproved,
          409,
          "PENALTY_POLICY_UNCONFIRMED",
        );
        const old = await one(
          this.db,
          "SELECT * FROM reviews WHERE team_id=?",
          d.teamId,
        );
        await this.mutate(
          actor.id,
          action,
          d.teamId,
          [
            [
              "INSERT INTO reviews VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(team_id) DO UPDATE SET version_id=excluded.version_id,eligibility=excluded.eligibility,astra=excluded.astra,codex=excluded.codex,diversity=excluded.diversity,false_claims=excluded.false_claims,evidence=excluded.evidence,reviewer_id=excluded.reviewer_id,updated_at=excluded.updated_at",
              d.teamId,
              d.versionId,
              d.eligibility,
              d.astra,
              d.codex,
              d.diversity,
              d.falseClaims,
              d.evidence,
              actor.id,
              this.now(),
            ],
          ],
          { before: old || null, after: d },
          d.reason,
        );
        return {};
      }
      case "moderate-feedback": {
        await this.staff();
        await this.unfrozen();
        const d = z
          .object({ authorId: id, teamId: id, valid: bool, reason })
          .parse(data);
        await this.mutate(
          actor.id,
          action,
          d.teamId,
          [
            [
              "UPDATE feedback SET valid=?,moderation_reason=? WHERE author_id=? AND team_id=?",
              d.valid ? 1 : 0,
              d.reason,
              d.authorId,
              d.teamId,
            ],
          ],
          { author: d.authorId, valid: d.valid },
          d.reason,
        );
        return {};
      }
      case "compute-results": {
        await this.staff();
        await this.unfrozen();
        return { items: await this.compute() };
      }
      case "resolve-tie": {
        await this.staff(true);
        await this.unfrozen();
        const d = z.object({ teamIds: z.unknown(), reason }).parse(data);
        const teamIds = z.array(id).min(2).max(160).parse(json(d.teamIds));
        demand(new Set(teamIds).size === teamIds.length, 422, "DUPLICATE_TEAM");
        const result = await this.compute(true);
        const first = result.find((r) => r.teamId === teamIds[0]);
        demand(first?.components, 422, "RANKED_TEAM_REQUIRED");
        const tied = result.filter(
          (r) => r.components?.total === first.components!.total,
        );
        demand(
          tied.length === teamIds.length &&
            tied.every((r) => teamIds.includes(r.teamId)),
          422,
          "COMPLETE_TIED_GROUP_REQUIRED",
        );
        const groupHash = await tieHash((await this.settings()).version, tied);
        await this.mutate(
          actor.id,
          "resolve-tie",
          groupHash,
          [
            ["DELETE FROM tie_resolutions WHERE group_hash=?", groupHash],
            ...teamIds.map(
              (teamId, i) =>
                [
                  "INSERT INTO tie_resolutions VALUES(?,?,?)",
                  groupHash,
                  teamId,
                  i + 1,
                ] as SQL,
            ),
          ],
          { order: teamIds },
          d.reason,
        );
        return {
          message: "Owner tie order recorded for this exact score breakdown.",
        };
      }
      case "freeze-results": {
        await this.staff(true);
        await this.unfrozen();
        const d = z.object({ reason }).parse(data);
        const s = await this.live();
        demand(
          s.policy.judgingClose &&
            this.now() >= s.policy.judgingClose &&
            s.policy.engagementClose &&
            this.now() >= s.policy.engagementClose,
          409,
          "SCORING_WINDOWS_OPEN",
        );
        const revision = (await one<{ version: number }>(
          this.db,
          "SELECT version FROM scoring_revision WHERE id=1",
        ))!.version;
        const result = await this.compute();
        demand(result.length > 0, 409, "NO_RESULTS");
        const snapshotId = crypto.randomUUID();
        await this.mutate(
          actor.id,
          action,
          snapshotId,
          [
            [
              "INSERT INTO result_snapshots VALUES(?,?,?,?,?,?)",
              snapshotId,
              s.version,
              revision,
              JSON.stringify(result),
              this.now(),
              actor.id,
            ],
          ],
          { count: result.length },
          d.reason,
        );
        return { snapshotId };
      }
      case "publish-results": {
        await this.staff(true);
        const d = z.object({ snapshotId: id, reason }).parse(data);
        await this.live();
        demand(
          await one(
            this.db,
            "SELECT id FROM result_snapshots WHERE id=?",
            d.snapshotId,
          ),
          404,
          "SNAPSHOT_NOT_FOUND",
        );
        demand(
          !(await one(this.db, "SELECT id FROM result_publication")),
          409,
          "ALREADY_PUBLISHED",
        );
        await this.mutate(
          actor.id,
          action,
          d.snapshotId,
          [
            [
              "INSERT INTO result_publication VALUES(1,?,?)",
              d.snapshotId,
              this.now(),
            ],
          ],
          {},
          d.reason,
        );
        return { message: "Frozen result snapshot published." };
      }
      default:
        throw new PortalError(404, "UNKNOWN_ACTION");
    }
  }
  async allocate(userId: string, actorId: string) {
    demand(
      await one(
        this.db,
        `SELECT id FROM users WHERE id=? AND ${attendancePredicate("users.id")}`,
        userId,
      ),
      409,
      "CHECKIN_REQUIRED",
    );
    const types = await rows<{ id: string }>(
      this.db,
      "SELECT id FROM credit_types WHERE active=1",
    );
    const sql: SQL[] = types.map((t) => [
      "INSERT INTO credit_allocations(inventory_id,type_id,user_id,assigned_at,recipient_email) SELECT i.id,i.type_id,?,?,(SELECT lower(email) FROM users WHERE id=?) FROM credit_inventory i WHERE i.type_id=? AND NOT EXISTS(SELECT 1 FROM credit_allocations a WHERE a.inventory_id=i.id) AND NOT EXISTS(SELECT 1 FROM credit_allocations a WHERE a.user_id=? AND a.type_id=?) ORDER BY i.id LIMIT 1",
      userId,
      this.now(),
      userId,
      t.id,
      userId,
      t.id,
    ]);
    await this.mutate(actorId, "allocate", userId, sql, {
      typeCount: types.length,
    });
    const assigned = await rows(
      this.db,
      "SELECT type_id FROM credit_allocations WHERE user_id=?",
      userId,
    );
    return {
      message:
        assigned.length < types.length
          ? "Checked in. Some allocations are pending inventory."
          : "Checked in. Available credits allocated once.",
      assigned: assigned.length,
    };
  }
  async compute(allowUnresolvedTies = false) {
    const s = await this.live();
    const versions = await rows<Version>(
      this.db,
      "SELECT v.* FROM submission_versions v WHERE attempt=(SELECT MAX(attempt) FROM submission_versions WHERE team_id=v.team_id)",
    );
    const entries = [];
    for (const v of versions) {
      const review = await one<Review>(
        this.db,
        "SELECT * FROM reviews WHERE team_id=?",
        v.team_id,
      );
      demand(
        review &&
          review.version_id === v.id &&
          review.eligibility !== "needs_review",
        409,
        "REVIEW_INCOMPLETE",
      );
      const t = (await one<Team>(
        this.db,
        "SELECT * FROM teams WHERE id=?",
        v.team_id,
      ))!;
      const revisedProject = await one<{ id: string }>(
        this.db,
        "SELECT id FROM projects WHERE team_id=?",
        t.id,
      );
      if (revisedProject) {
        const eligible = await one<{ status: string }>(
          this.db,
          "SELECT status FROM project_eligibility WHERE project_id=? AND version_id=?",
          revisedProject.id,
          v.id,
        );
        if (eligible) review.eligibility = eligible.status;
      }
      const human = revisedProject
        ? await rows<{ rating: number }>(
            this.db,
            "SELECT h.rating FROM project_review_history h JOIN project_assignments a ON a.project_id=h.project_id AND a.user_id=h.author_id AND a.kind='judge' JOIN users u ON u.id=h.author_id LEFT JOIN portal_roles r ON r.user_id=u.id WHERE h.project_id=? AND h.version_id=? AND h.kind='judge' AND h.rating IS NOT NULL AND COALESCE(r.role,u.role)='judge' AND NOT EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=h.author_id AND m.team_id=?) AND h.rowid=(SELECT MAX(last.rowid) FROM project_review_history last WHERE last.project_id=h.project_id AND last.version_id=h.version_id AND last.author_id=h.author_id AND last.kind='judge')",
            revisedProject.id,
            v.id,
            t.id,
          )
        : await rows<{ rating: number }>(
            this.db,
            "SELECT h.rating FROM human_scores h JOIN users u ON u.id=h.judge_id JOIN judge_assignments a ON a.judge_id=h.judge_id AND a.team_id=h.team_id WHERE h.team_id=? AND u.role='judge' AND NOT EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=h.judge_id AND m.team_id=h.team_id)",
            t.id,
          );
      if (review.eligibility === "eligible") {
        demand(
          human.length >= s.policy.minJudges &&
            (s.policy.weights.ai === 0 || review.astra !== null) &&
            review.codex !== null &&
            review.diversity !== null,
          409,
          "SCORE_COVERAGE_INCOMPLETE",
        );
      }
      const voteCount = Number(
        (await one<{ n: number }>(
          this.db,
          "SELECT count(*) n FROM votes v JOIN users u ON u.id=v.voter_id JOIN registrations r ON r.email=u.email JOIN check_ins c ON c.user_id=u.id WHERE v.team_id=? AND r.status='approved' AND NOT EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=v.voter_id AND m.team_id=v.team_id)",
          t.id,
        ))!.n,
      );
      const feedbackCount = Number(
        (await one<{ n: number }>(
          this.db,
          "SELECT count(*) n FROM feedback f JOIN users u ON u.id=f.author_id JOIN registrations r ON r.email=u.email JOIN check_ins c ON c.user_id=u.id WHERE f.team_id=? AND f.valid=1 AND r.status='approved' AND NOT EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=f.author_id AND m.team_id=f.team_id)",
          t.id,
        ))!.n,
      );
      const revisedCounts =
        revisedProject &&
        review.eligibility === "eligible" &&
        s.policy.projectEngagementRule === "score-with-approved-normalization"
          ? await qualifiedEngagement(
              this.db,
              s.policy,
              revisedProject.id,
              v.id,
            )
          : undefined;
      demand(
        !revisedCounts?.pendingFeedback,
        409,
        "ENGAGEMENT_REVIEW_INCOMPLETE",
        "Potential scoring feedback still needs staff qualification. Public comments alone do not earn scoring credit.",
      );
      entries.push({
        v,
        t,
        review,
        human: human.map((x) => x.rating),
        voteCount: revisedProject ? revisedCounts?.votes || 0 : voteCount,
        feedbackCount: revisedProject
          ? revisedCounts?.feedback || 0
          : feedbackCount,
      });
    }
    const maxVotes = Math.max(
      0,
      ...entries
        .filter((e) => e.review.eligibility === "eligible")
        .map((e) => e.voteCount),
    );
    const result = entries.map((e) => ({
      teamId: e.t.id,
      name: e.t.name,
      projectName: JSON.parse(e.v.payload).projectName,
      eligibility: e.review.eligibility,
      components: score({
        weights: s.policy.weights,
        human: e.human,
        astra: e.review.astra ?? 0,
        codex: e.review.codex!,
        diversity: e.review.diversity!,
        votes: e.voteCount,
        maxVotes,
        voteFormula: s.policy.voteFormula as "sqrt-relative" | "fixed-target",
        voteTarget: s.policy.voteTarget,
        feedback: e.feedbackCount,
        feedbackTarget: s.policy.feedbackTarget,
        falseClaims: e.review.false_claims,
        eligible: e.review.eligibility === "eligible",
      }),
    }));
    result.sort(
      (a, b) => (b.components?.total ?? -1) - (a.components?.total ?? -1),
    );
    for (let start = 0; start < result.length;) {
      let end = start + 1;
      while (
        end < result.length &&
        result[start].components &&
        result[end].components?.total === result[start].components?.total
      )
        end++;
      if (end - start > 1) {
        const group = result.slice(start, end);
        const hash = await tieHash(s.version, group);
        const order = await rows<{ team_id: string; ordinal: number }>(
          this.db,
          "SELECT team_id,ordinal FROM tie_resolutions WHERE group_hash=?",
          hash,
        );
        const resolved =
          order.length === group.length &&
          group.every((r) => order.some((o) => o.team_id === r.teamId));
        demand(
          resolved || allowUnresolvedTies,
          409,
          "TIE_REQUIRES_OWNER_RESOLUTION",
          "Owner must record the complete tied group order and reason under the approved policy.",
        );
        if (resolved) {
          group.sort(
            (a, b) =>
              order.find((o) => o.team_id === a.teamId)!.ordinal -
              order.find((o) => o.team_id === b.teamId)!.ordinal,
          );
          result.splice(start, group.length, ...group);
        }
      }
      start = end;
    }
    return result.map((r, i) => ({
      ...r,
      policyVersion: s.version,
      rank: r.components ? i + 1 : null,
    }));
  }
  async view(
    path: string,
    options: { search?: string; page?: number; focus?: string } = {},
  ): Promise<Record<string, unknown>> {
    // Use one permission target for ordinary URL slash aliases as well as API views.
    // In particular, /admin/permissions/ must retain the owner-only requirement.
    path = path.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
    const revised = await new PortalExperience(this).view(path, options);
    if (revised !== null) return revised;
    const s = await this.settings(true);
    const publicPolicy = {
      ideaLock: s.policy.ideaLock,
      membershipFreeze: s.policy.membershipFreeze,
      submissionOpen: s.policy.submissionOpen,
      submissionClose: s.policy.submissionClose,
      active: !!s.active,
    };
    if (path === "/" || path === "/rules" || path === "/local-test")
      return { policy: publicPolicy };
    if (path === "/teams") {
      return {
        items: await rows(
          this.db,
          "SELECT id,name,bio FROM teams ORDER BY name",
        ),
      };
    }
    if (/^\/teams\/[^/]+$/.test(path)) {
      const teamId = path.split("/")[2];
      const t = await one(
        this.db,
        "SELECT id,name,bio FROM teams WHERE id=?",
        teamId,
      );
      demand(t, 404, "TEAM_NOT_FOUND");
      return {
        items: [t],
        members: await rows(
          this.db,
          "SELECT u.name,p.bio,p.socials FROM memberships m JOIN users u ON u.id=m.user_id JOIN profiles p ON p.user_id=u.id WHERE m.team_id=? AND p.public=1",
          teamId,
        ),
        idea:
          this.now() >= s.policy.ideaReveal
            ? await one(
                this.db,
                "SELECT title,core,description FROM ideas WHERE team_id=?",
                teamId,
              )
            : undefined,
      };
    }
    if (path === "/projects" || /^\/projects\/[^/]+$/.test(path)) {
      if (
        !s.active ||
        !s.policy.engagementOpen ||
        this.now() < s.policy.engagementOpen
      )
        return { items: [], message: "Project discovery has not opened yet." };
      const result = await rows<Version>(
        this.db,
        "SELECT v.* FROM submission_versions v WHERE attempt=(SELECT MAX(attempt) FROM submission_versions WHERE team_id=v.team_id)",
      );
      const items = result
        .filter((v) => path === "/projects" || v.team_id === path.split("/")[2])
        .map((v) => {
          const p = JSON.parse(v.payload);
          return {
            id: v.team_id,
            projectName: p.projectName,
            problemSolution: p.problemSolution,
            description: p.description,
            github: p.github,
            demo: p.demo,
            video: p.video,
            features: p.features,
          };
        });
      return { items };
    }
    if (path === "/leaderboard" || path === "/winners") {
      const pub = await one<{ payload: string }>(
        this.db,
        "SELECT s.payload FROM result_publication p JOIN result_snapshots s ON s.id=p.snapshot_id",
      );
      demand(
        pub,
        404,
        "RESULTS_UNPUBLISHED",
        "Results are private until the owner publishes a frozen snapshot.",
      );
      return {
        items: JSON.parse(pub.payload).map((r: Record<string, unknown>) => ({
          rank: r.rank,
          team: r.name,
          project: r.projectName,
          eligibility: r.eligibility,
          score: (r.components as { total: number } | null)?.total ?? null,
          components: r.components,
        })),
      };
    }
    const u = await this.actor();
    const base = {
      me: u,
      registration: await one(
        this.db,
        "SELECT status,luma_confirmed FROM registrations WHERE email=?",
        u.email,
      ),
      policy: publicPolicy,
    };
    if (path.startsWith("/admin")) {
      await this.staff(
        path === "/admin/settings" || path === "/admin/permissions",
      );
      const list = path.split("/")[2];
      if (!list) return { ...base, metrics: await this.metrics(), items: [] };
      if (list === "settings")
        return {
          ...base,
          items: [],
          policy: s.policy,
          blockers: policyBlockers(s.policy),
        };
      return { ...base, items: await this.adminList(list) };
    }
    if (path.startsWith("/judge")) {
      demand(u.role === "judge", 403, "JUDGE_REQUIRED");
      const teamId = path.split("/")[2];
      if (teamId)
        demand(
          await one(
            this.db,
            "SELECT team_id FROM judge_assignments WHERE judge_id=? AND team_id=?",
            u.id,
            teamId,
          ),
          403,
          "ASSIGNMENT_REQUIRED",
        );
      const items = await rows<Record<string, unknown>>(
        this.db,
        "SELECT t.id,t.name,v.payload,j.report,h.rating,h.notes FROM judge_assignments a JOIN teams t ON t.id=a.team_id LEFT JOIN submission_versions v ON v.team_id=t.id AND v.attempt=(SELECT MAX(attempt) FROM submission_versions WHERE team_id=t.id) LEFT JOIN astra_jobs j ON j.version_id=v.id LEFT JOIN human_scores h ON h.team_id=t.id AND h.judge_id=a.judge_id WHERE a.judge_id=? AND (? IS NULL OR t.id=?)",
        u.id,
        teamId || null,
        teamId || null,
      );
      return {
        ...base,
        items: items.map((r) => {
          const p = r.payload ? JSON.parse(String(r.payload)) : {};
          return {
            id: r.id,
            name: r.name,
            github: p.github || "",
            demo: p.demo || "",
            description: p.description || "",
            contributions: p.contributions || [],
            rating: r.rating,
            notes: r.notes,
          };
        }),
      };
    }
    demand(
      [
        "/dashboard",
        "/dashboard/profile",
        "/dashboard/team",
        "/dashboard/credits",
        "/dashboard/submission",
      ].includes(path),
      404,
      "PAGE_NOT_FOUND",
    );
    const t = await this.team(u.id);
    if (path === "/dashboard/profile") {
      const p = await one<Record<string, unknown>>(
        this.db,
        "SELECT * FROM profiles WHERE user_id=?",
        u.id,
      );
      return {
        ...base,
        profile: { ...p, socials: JSON.parse(String(p?.socials || "[]")) },
      };
    }
    if (path === "/dashboard/credits") {
      await this.approved();
      demand(u.role !== "judge", 403, "JUDGES_CANNOT_ACCESS_CREDITS");
      demand(
        (await personStatus(this, u.id)).checkedIn,
        403,
        "CHECKIN_REQUIRED",
      );
      return {
        ...base,
        items: await rows(
          this.db,
          "SELECT t.id type_id,t.name,t.instructions,CASE WHEN a.inventory_id IS NOT NULL THEN 1 ELSE 0 END allocated FROM credit_types t LEFT JOIN credit_allocations a ON a.type_id=t.id AND a.user_id=? AND lower(a.recipient_email)=? WHERE t.active=1",
          u.id,
          u.email.toLowerCase(),
        ),
      };
    }
    if (path === "/dashboard/submission")
      return {
        ...base,
        team: t,
        members: t
          ? await rows(
              this.db,
              "SELECT u.id,u.name FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.team_id=?",
              t.id,
            )
          : [],
        attempts: t
          ? await rows(
              this.db,
              "SELECT id,attempt,created_at,payload FROM submission_versions WHERE team_id=? ORDER BY attempt DESC",
              t.id,
            )
          : [],
      };
    return {
      ...base,
      team: t,
      idea: t
        ? await one(this.db, "SELECT * FROM ideas WHERE team_id=?", t.id)
        : undefined,
      members: t
        ? await rows(
            this.db,
            "SELECT u.id,u.name,CASE WHEN u.id=t.leader_id THEN 'leader' ELSE 'member' END role FROM memberships m JOIN users u ON u.id=m.user_id JOIN teams t ON t.id=m.team_id WHERE t.id=?",
            t.id,
          )
        : [],
      actions: await rows(
        this.db,
        "SELECT a.id,a.team_id,t.name team_name,a.user_id,a.kind,a.status FROM team_actions a JOIN teams t ON t.id=a.team_id WHERE a.user_id=? OR t.leader_id=?",
        u.id,
        u.id,
      ),
    };
  }
  async metrics() {
    return Promise.all(
      [
        ["Signed-in accounts", "users"],
        ["Approved registrations", "registrations WHERE status='approved'"],
        ["Checked in", "check_ins"],
        ["Teams", "teams"],
        ["Submitted versions", "submission_versions"],
        [
          "Pending allocations",
          "credit_types t CROSS JOIN check_ins c WHERE t.active=1 AND NOT EXISTS(SELECT 1 FROM credit_allocations a WHERE a.user_id=c.user_id AND a.type_id=t.id)",
        ],
      ].map(async ([label, source]) => ({
        label,
        value: (await one<{ n: number }>(
          this.db,
          "SELECT count(*) n FROM " + source,
        ))!.n,
      })),
    );
  }
  async adminList(list: string) {
    if (list === "team-emails") {
      await this.staff();
      const view = await new PortalExperience(this).view("/admin/teams");
      return (view!.items as any[]).flatMap((t) =>
        t.members.map((m: any) => ({
          email: m.email,
          team: t.name,
          status: t.status,
          teamStatus: t.status,
          teamLocked: t.locked,
        })),
      );
    }

    if (["audit", "logs", "permissions", "settings"].includes(list))
      await this.staff(true);
    if (list === "participants")
      return new PortalExperience(this).participantRows();
    if (list === "teams" || list === "submissions") {
      const view = await new PortalExperience(this).view("/admin/" + list);
      return (view?.items || []) as Record<string, unknown>[];
    }
    const queries: Record<string, string> = {
      participants:
        "SELECT u.id,u.name,r.email,r.status,r.luma_confirmed,c.created_at checked_in FROM registrations r LEFT JOIN users u ON u.email=r.email LEFT JOIN check_ins c ON c.user_id=u.id UNION ALL SELECT u.id,u.name,u.email,NULL,NULL,NULL FROM users u WHERE NOT EXISTS(SELECT 1 FROM registrations r WHERE r.email=u.email)",
      teams:
        "SELECT t.id,t.name,t.leader_id,count(m.user_id) members,i.title,i.hash FROM teams t LEFT JOIN memberships m ON m.team_id=t.id LEFT JOIN ideas i ON i.team_id=t.id GROUP BY t.id",
      "check-in":
        "SELECT u.id,u.name,r.status,c.created_at checked_in,(SELECT count(*) FROM credit_allocations a WHERE a.user_id=u.id) allocated FROM users u LEFT JOIN registrations r ON r.email=u.email LEFT JOIN check_ins c ON c.user_id=u.id",
      credits:
        "SELECT t.id,t.name,t.active,(SELECT count(*) FROM credit_inventory i WHERE i.type_id=t.id) inventory,(SELECT count(*) FROM credit_allocations a WHERE a.type_id=t.id) assigned FROM credit_types t",
      submissions:
        "SELECT id,team_id,attempt,created_at,payload FROM submission_versions ORDER BY created_at DESC",
      astra:
        "SELECT id,version_id,state,attempts,report,error,updated_at FROM astra_jobs",
      judging:
        "SELECT a.judge_id,a.team_id,h.rating,h.updated_at FROM judge_assignments a LEFT JOIN human_scores h ON h.judge_id=a.judge_id AND h.team_id=a.team_id",
      votes: "SELECT team_id,count(*) votes FROM votes GROUP BY team_id",
      feedback:
        "SELECT author_id,team_id,text,valid,moderation_reason FROM feedback",
      results:
        "SELECT id,policy_version,created_at,frozen_by FROM result_snapshots",
      permissions: "SELECT id,name,email,role FROM users",
      audit:
        "SELECT id,actor_id,action,entity_id,detail,reason,created_at FROM audit_logs ORDER BY created_at DESC LIMIT 2000",
      settings: "SELECT id,active,version,policy FROM event_settings",
    };
    demand(list in queries, 404, "LIST_NOT_FOUND");
    return rows(this.db, queries[list]);
  }
}
async function tieHash(
  version: number,
  group: { teamId: string; components: unknown }[],
) {
  return sha256(
    JSON.stringify({
      version,
      teams: [...group]
        .sort((a, b) => a.teamId.localeCompare(b.teamId))
        .map((r) => ({ teamId: r.teamId, components: r.components })),
    }),
  );
}
function similarity(a: string, b: string) {
  const grams = (v: string) =>
    new Set(
      Array.from({ length: Math.max(0, v.length - 2) }, (_, i) =>
        v.slice(i, i + 3),
      ),
    );
  const x = grams(a),
    y = grams(b);
  return (
    (2 * [...x].filter((g) => y.has(g)).length) / Math.max(1, x.size + y.size)
  );
}
