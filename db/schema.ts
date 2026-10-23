// Logical schema for Sites/Drizzle. Triggers remain in the reviewed SQL migration.
import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
  unique,
  uniqueIndex,
  index,
  check,
  customType,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
const nocase = customType<{ data: string }>({
  dataType: () => "text COLLATE NOCASE",
});

export const astra_jobs = sqliteTable(
  "astra_jobs",
  {
    id: text("id").primaryKey(),
    version_id: text("version_id")
      .notNull()
      .references((): AnySQLiteColumn => submission_versions.id),
    state: text("state")
      .notNull()
      .default(sql`'pending'`),
    attempts: integer("attempts")
      .notNull()
      .default(sql`0`),
    report: text("report"),
    error: text("error"),
    updated_at: text("updated_at").notNull(),
  },
  (table) => [
    unique().on(table.version_id),
    check(
      "astra_jobs_check_1",
      sql`state IN ('pending','running','needs_review','failed_retryable','finalized')`,
    ),
    check("astra_jobs_check_2", sql`report IS NULL OR json_valid(report)`),
  ],
);

export const audit_logs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    actor_id: text("actor_id")
      .notNull()
      .references((): AnySQLiteColumn => users.id),
    action: text("action").notNull(),
    entity_id: text("entity_id").notNull(),
    detail: text("detail").notNull(),
    reason: text("reason").notNull(),
    created_at: text("created_at").notNull(),
  },
  (table) => [
    index("audit_time").on(table.created_at),
    check("audit_logs_check_1", sql`json_valid(detail)`),
  ],
);

export const check_ins = sqliteTable(
  "check_ins",
  {
    user_id: text("user_id")
      .primaryKey()
      .references((): AnySQLiteColumn => users.id),
    actor_id: text("actor_id")
      .notNull()
      .references((): AnySQLiteColumn => users.id),
    created_at: text("created_at").notNull(),
  },
  (table) => [],
);

export const credit_allocations = sqliteTable(
  "credit_allocations",
  {
    inventory_id: text("inventory_id")
      .primaryKey()
      .references((): AnySQLiteColumn => credit_inventory.id),
    type_id: text("type_id")
      .notNull()
      .references((): AnySQLiteColumn => credit_types.id),
    user_id: text("user_id")
      .notNull()
      .references((): AnySQLiteColumn => users.id),
    assigned_at: text("assigned_at").notNull(),
    recipient_email: text("recipient_email"),
  },
  (table) => [unique().on(table.type_id, table.user_id)],
);

export const credit_inventory = sqliteTable(
  "credit_inventory",
  {
    id: text("id").primaryKey(),
    type_id: text("type_id")
      .notNull()
      .references((): AnySQLiteColumn => credit_types.id),
    ciphertext: text("ciphertext").notNull(),
    voucher_value: text("voucher_value"),
    fingerprint: text("fingerprint").notNull(),
    created_at: text("created_at").notNull(),
  },
  (table) => [unique().on(table.type_id, table.fingerprint)],
);

export const credit_types = sqliteTable(
  "credit_types",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    instructions: text("instructions").notNull(),
    active: integer("active")
      .notNull()
      .default(sql`1`),
  },
  (table) => [
    unique().on(table.name),
    check("credit_types_check_1", sql`active IN (0,1)`),
  ],
);

export const event_settings = sqliteTable(
  "event_settings",
  {
    id: integer("id").primaryKey(),
    policy: text("policy").notNull(),
    active: integer("active")
      .notNull()
      .default(sql`0`),
    version: integer("version")
      .notNull()
      .default(sql`1`),
  },
  (table) => [
    check("event_settings_check_1", sql`id=1`),
    check("event_settings_check_2", sql`json_valid(policy)`),
    check("event_settings_check_3", sql`active IN (0,1)`),
  ],
);

export const feedback = sqliteTable(
  "feedback",
  {
    author_id: text("author_id")
      .notNull()
      .references((): AnySQLiteColumn => users.id),
    team_id: text("team_id")
      .notNull()
      .references((): AnySQLiteColumn => teams.id),
    text: text("text").notNull(),
    valid: integer("valid")
      .notNull()
      .default(sql`1`),
    moderation_reason: text("moderation_reason"),
    updated_at: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.author_id, table.team_id] }),
    check("feedback_check_1", sql`valid IN (0,1)`),
  ],
);

export const human_scores = sqliteTable(
  "human_scores",
  {
    judge_id: text("judge_id")
      .notNull()
      .references((): AnySQLiteColumn => users.id),
    team_id: text("team_id")
      .notNull()
      .references((): AnySQLiteColumn => teams.id),
    rating: real("rating").notNull(),
    notes: text("notes").notNull(),
    updated_at: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.judge_id, table.team_id] }),
    check("human_scores_check_1", sql`rating BETWEEN 0 AND 10`),
  ],
);

export const idea_revisions = sqliteTable(
  "idea_revisions",
  {
    id: text("id").primaryKey(),
    team_id: text("team_id")
      .notNull()
      .references((): AnySQLiteColumn => teams.id),
    snapshot: text("snapshot").notNull(),
    created_at: text("created_at").notNull(),
  },
  (table) => [check("idea_revisions_check_1", sql`json_valid(snapshot)`)],
);

export const ideas = sqliteTable(
  "ideas",
  {
    team_id: text("team_id")
      .primaryKey()
      .references((): AnySQLiteColumn => teams.id),
    title: text("title").notNull(),
    core: text("core").notNull(),
    description: text("description").notNull(),
    hash: text("hash").notNull(),
    updated_at: text("updated_at").notNull(),
  },
  (table) => [],
);

export const import_previews = sqliteTable(
  "import_previews",
  {
    actor_id: text("actor_id")
      .notNull()
      .references((): AnySQLiteColumn => users.id),
    digest: text("digest").notNull(),
    created_at: text("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.actor_id, table.digest] })],
);

export const judge_assignments = sqliteTable(
  "judge_assignments",
  {
    judge_id: text("judge_id")
      .notNull()
      .references((): AnySQLiteColumn => users.id),
    team_id: text("team_id")
      .notNull()
      .references((): AnySQLiteColumn => teams.id),
  },
  (table) => [primaryKey({ columns: [table.judge_id, table.team_id] })],
);

export const memberships = sqliteTable(
  "memberships",
  {
    user_id: text("user_id")
      .primaryKey()
      .references((): AnySQLiteColumn => users.id),
    team_id: text("team_id")
      .notNull()
      .references((): AnySQLiteColumn => teams.id),
    joined_at: text("joined_at").notNull(),
  },
  (table) => [index("memberships_team").on(table.team_id)],
);

export const profiles = sqliteTable(
  "profiles",
  {
    user_id: text("user_id")
      .primaryKey()
      .references((): AnySQLiteColumn => users.id),
    bio: text("bio")
      .notNull()
      .default(sql`''`),
    socials: text("socials")
      .notNull()
      .default(sql`'[]'`),
    gender: text("gender")
      .notNull()
      .default(sql`'prefer-not-to-say'`),
    gender_description: text("gender_description")
      .notNull()
      .default(sql`''`),
    public: integer("public")
      .notNull()
      .default(sql`0`),
  },
  (table) => [
    check("profiles_check_1", sql`json_valid(socials)`),
    check(
      "profiles_check_2",
      sql`gender IN ('woman','man','non-binary','self-described','prefer-not-to-say')`,
    ),
    check("profiles_check_3", sql`public IN (0,1)`),
  ],
);

export const registrations = sqliteTable(
  "registrations",
  {
    email: nocase("email").primaryKey(),
    status: text("status")
      .notNull()
      .default(sql`'pending'`),
    luma_confirmed: integer("luma_confirmed")
      .notNull()
      .default(sql`0`),
  },
  (table) => [
    check(
      "registrations_check_1",
      sql`status IN ('pending','approved','rejected','cancelled')`,
    ),
    check("registrations_check_2", sql`luma_confirmed IN (0,1)`),
  ],
);

export const request_buckets = sqliteTable(
  "request_buckets",
  {
    actor_id: text("actor_id").notNull(),
    window: integer("window").notNull(),
    count: integer("count").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.actor_id, table.window] }),
    check("request_buckets_check_1", sql`count<=120`),
  ],
);

export const result_publication = sqliteTable(
  "result_publication",
  {
    id: integer("id").primaryKey(),
    snapshot_id: text("snapshot_id")
      .notNull()
      .references((): AnySQLiteColumn => result_snapshots.id),
    published_at: text("published_at").notNull(),
  },
  (table) => [check("result_publication_check_1", sql`id=1`)],
);

export const result_snapshots = sqliteTable(
  "result_snapshots",
  {
    id: text("id").primaryKey(),
    policy_version: integer("policy_version").notNull(),
    source_revision: integer("source_revision").notNull(),
    payload: text("payload").notNull(),
    created_at: text("created_at").notNull(),
    frozen_by: text("frozen_by")
      .notNull()
      .references((): AnySQLiteColumn => users.id),
  },
  (table) => [check("result_snapshots_check_1", sql`json_valid(payload)`)],
);

export const reviews = sqliteTable(
  "reviews",
  {
    team_id: text("team_id")
      .primaryKey()
      .references((): AnySQLiteColumn => teams.id),
    version_id: text("version_id")
      .notNull()
      .references((): AnySQLiteColumn => submission_versions.id),
    eligibility: text("eligibility").notNull(),
    astra: real("astra"),
    codex: real("codex"),
    diversity: real("diversity"),
    false_claims: integer("false_claims")
      .notNull()
      .default(sql`0`),
    evidence: text("evidence").notNull(),
    reviewer_id: text("reviewer_id")
      .notNull()
      .references((): AnySQLiteColumn => users.id),
    updated_at: text("updated_at").notNull(),
  },
  (table) => [
    check(
      "reviews_check_1",
      sql`eligibility IN ('eligible','ineligible','needs_review')`,
    ),
    check("reviews_check_2", sql`astra BETWEEN 0 AND 30`),
    check("reviews_check_3", sql`codex BETWEEN 0 AND 5`),
    check("reviews_check_4", sql`diversity BETWEEN 0 AND 10`),
    check("reviews_check_5", sql`false_claims BETWEEN 0 AND 2`),
  ],
);

export const scoring_revision = sqliteTable(
  "scoring_revision",
  {
    id: integer("id").primaryKey(),
    version: integer("version")
      .notNull()
      .default(sql`0`),
  },
  (table) => [check("scoring_revision_check_1", sql`id=1`)],
);

export const submission_versions = sqliteTable(
  "submission_versions",
  {
    id: text("id").primaryKey(),
    team_id: text("team_id")
      .notNull()
      .references((): AnySQLiteColumn => teams.id),
    attempt: integer("attempt").notNull(),
    payload: text("payload").notNull(),
    created_at: text("created_at").notNull(),
  },
  (table) => [
    unique().on(table.team_id, table.attempt),
    check("submission_versions_check_1", sql`attempt BETWEEN 1 AND 3`),
    check("submission_versions_check_2", sql`json_valid(payload)`),
  ],
);

export const team_actions = sqliteTable(
  "team_actions",
  {
    id: text("id").primaryKey(),
    team_id: text("team_id")
      .notNull()
      .references((): AnySQLiteColumn => teams.id),
    user_id: text("user_id")
      .notNull()
      .references((): AnySQLiteColumn => users.id),
    kind: text("kind").notNull(),
    status: text("status")
      .notNull()
      .default(sql`'pending'`),
    created_at: text("created_at").notNull(),
  },
  (table) => [
    unique().on(table.team_id, table.user_id, table.kind),
    check("team_actions_check_1", sql`kind IN ('invite','request')`),
    check(
      "team_actions_check_2",
      sql`status IN ('pending','accepted','declined')`,
    ),
  ],
);

export const teams = sqliteTable(
  "teams",
  {
    id: text("id").primaryKey(),
    name: nocase("name").notNull(),
    leader_id: text("leader_id")
      .notNull()
      .references((): AnySQLiteColumn => users.id),
    bio: text("bio")
      .notNull()
      .default(sql`''`),
    created_at: text("created_at").notNull(),
  },
  (table) => [unique().on(table.name)],
);

export const tie_resolutions = sqliteTable(
  "tie_resolutions",
  {
    group_hash: text("group_hash").notNull(),
    team_id: text("team_id")
      .notNull()
      .references((): AnySQLiteColumn => teams.id),
    ordinal: integer("ordinal").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.group_hash, table.team_id] }),
    unique().on(table.group_hash, table.ordinal),
    check("tie_resolutions_check_1", sql`ordinal>0`),
  ],
);

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: nocase("email").notNull(),
    name: text("name").notNull(),
    role: text("role")
      .notNull()
      .default(sql`'participant'`),
    created_at: text("created_at").notNull(),
  },
  (table) => [
    unique().on(table.email),
    check("users_check_1", sql`role IN ('participant','admin','judge')`),
  ],
);

export const votes = sqliteTable(
  "votes",
  {
    voter_id: text("voter_id")
      .notNull()
      .references((): AnySQLiteColumn => users.id),
    team_id: text("team_id")
      .notNull()
      .references((): AnySQLiteColumn => teams.id),
    created_at: text("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.voter_id, table.team_id] })],
);

export const participant_profiles = sqliteTable("participant_profiles", {
  user_id: text("user_id")
    .primaryKey()
    .references(() => users.id),
  display_name: text("display_name").notNull(),
  skills: text("skills").notNull().default(""),
  completed_at: text("completed_at").notNull(),
  gender_confirmed: integer("gender_confirmed").notNull().default(0),
});
export const portal_roles = sqliteTable(
  "portal_roles",
  {
    user_id: text("user_id")
      .primaryKey()
      .references(() => users.id),
    role: text("role").notNull(),
    granted_by: text("granted_by")
      .notNull()
      .references(() => users.id),
    updated_at: text("updated_at").notNull(),
  },
  (t) => [
    check(
      "portal_role_valid",
      sql`${t.role} IN ('participant','volunteer','mentor','judge','admin')`,
    ),
  ],
);
export const team_styles = sqliteTable("team_styles", {
  team_id: text("team_id")
    .primaryKey()
    .references(() => teams.id),
  avatar: text("avatar").notNull().default("orbit"),
  color_key: text("color_key"),
  palette: text("palette").notNull().default("forest"),
});
export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    team_id: text("team_id")
      .notNull()
      .unique()
      .references(() => teams.id),
    slug: text("slug").notNull().unique(),
    draft: text("draft").notNull().default("{}"),
    revision: integer("revision").notNull().default(1),
    published_version_id: text("published_version_id").references(
      () => submission_versions.id,
    ),
    updated_at: text("updated_at").notNull(),
  },
  (t) => [check("project_draft_json", sql`json_valid(${t.draft})`)],
);
export const project_upvotes = sqliteTable(
  "project_upvotes",
  {
    project_id: text("project_id")
      .notNull()
      .references(() => projects.id),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id),
    created_at: text("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.project_id, t.user_id] })],
);
export const project_comments = sqliteTable(
  "project_comments",
  {
    id: text("id").primaryKey(),
    project_id: text("project_id")
      .notNull()
      .references(() => projects.id),
    author_id: text("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    created_at: text("created_at").notNull(),
  },
  (t) => [index("project_comments_project").on(t.project_id, t.created_at)],
);
export const project_assignments = sqliteTable(
  "project_assignments",
  {
    project_id: text("project_id")
      .notNull()
      .references(() => projects.id),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id),
    kind: text("kind").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.project_id, t.user_id] }),
    check("project_assignment_kind", sql`${t.kind} IN ('judge','mentor')`),
  ],
);
export const project_review_history = sqliteTable(
  "project_review_history",
  {
    id: text("id").primaryKey(),
    project_id: text("project_id")
      .notNull()
      .references(() => projects.id),
    version_id: text("version_id")
      .notNull()
      .references(() => submission_versions.id),
    author_id: text("author_id")
      .notNull()
      .references(() => users.id),
    kind: text("kind").notNull(),
    body: text("body").notNull(),
    rating: real("rating"),
    created_at: text("created_at").notNull(),
  },
  (t) => [
    check("project_review_kind", sql`${t.kind} IN ('judge','mentor','admin')`),
    check("project_review_rating", sql`${t.rating} BETWEEN 0 AND 10`),
  ],
);
export const evaluation_runs = sqliteTable(
  "evaluation_runs",
  {
    id: text("id").primaryKey(),
    project_id: text("project_id")
      .notNull()
      .references(() => projects.id),
    version_id: text("version_id")
      .notNull()
      .references(() => submission_versions.id),
    config_key: text("config_key").notNull(),
    state: text("state").notNull(),
    report: text("report"),
    error: text("error"),
    score: real("score"),
    provenance: text("provenance"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
  },
  (t) => [
    check(
      "evaluation_run_state",
      sql`${t.state} IN ('queued','running','completed','failed','stale')`,
    ),
    check(
      "evaluation_run_report",
      sql`${t.report} IS NULL OR json_valid(${t.report})`,
    ),
    uniqueIndex("evaluation_single_active")
      .on(t.version_id, t.config_key)
      .where(sql`${t.state} IN ('queued','running')`),
  ],
);
export const event_content = sqliteTable("event_content", {
  id: integer("id").primaryKey(),
  draft: text("draft").notNull(),
  published: text("published"),
  revision: integer("revision").notNull().default(1),
  updated_at: text("updated_at").notNull(),
});
export const private_venue = sqliteTable("private_venue", {
  id: integer("id").primaryKey(),
  draft: text("draft").notNull(),
  published: text("published"),
  revision: integer("revision").notNull().default(1),
  updated_at: text("updated_at").notNull(),
});
export const private_venue_managers = sqliteTable("private_venue_managers", {
  user_id: text("user_id")
    .primaryKey()
    .references(() => users.id),
  granted_by: text("granted_by")
    .notNull()
    .references(() => users.id),
  updated_at: text("updated_at").notNull(),
});
export const event_content_history = sqliteTable(
  "event_content_history",
  {
    id: text("id").primaryKey(),
    scope: text("scope").notNull(),
    revision: integer("revision").notNull(),
    snapshot: text("snapshot").notNull(),
    actor_id: text("actor_id")
      .notNull()
      .references(() => users.id),
    created_at: text("created_at").notNull(),
  },
  (t) => [check("content_scope", sql`${t.scope} IN ('public','private')`)],
);
export const write_guards = sqliteTable(
  "write_guards",
  { token: text("token").primaryKey(), valid: integer("valid").notNull() },
  (t) => [check("write_guard_valid", sql`${t.valid}=1`)],
);

export const project_eligibility = sqliteTable(
  "project_eligibility",
  {
    project_id: text("project_id")
      .primaryKey()
      .references(() => projects.id),
    version_id: text("version_id")
      .notNull()
      .references(() => submission_versions.id),
    status: text("status").notNull(),
    reason: text("reason").notNull(),
    decided_by: text("decided_by")
      .notNull()
      .references(() => users.id),
    updated_at: text("updated_at").notNull(),
  },
  (t) => [
    check(
      "project_eligibility_status",
      sql`${t.status} IN ('eligible','ineligible','needs_review')`,
    ),
  ],
);

export const score_releases = sqliteTable(
  "score_releases",
  {
    id: text("id").primaryKey(),
    stage: text("stage").notNull().unique(),
    source_id: text("source_id").notNull(),
    payload: text("payload").notNull(),
    criteria: text("criteria"),
    created_at: text("created_at").notNull(),
    actor_id: text("actor_id")
      .notNull()
      .references(() => users.id),
  },
  (t) => [
    check("score_release_stage", sql`${t.stage} IN ('ai','final')`),
    check("score_release_json", sql`json_valid(${t.payload})`),
  ],
);
export const winner_reveals = sqliteTable(
  "winner_reveals",
  {
    release_id: text("release_id")
      .notNull()
      .references(() => score_releases.id),
    position: integer("position").notNull(),
    project_id: text("project_id")
      .notNull()
      .references(() => projects.id),
    created_at: text("created_at").notNull(),
    actor_id: text("actor_id")
      .notNull()
      .references(() => users.id),
  },
  (t) => [
    primaryKey({ columns: [t.release_id, t.position] }),
    unique().on(t.release_id, t.project_id),
    check("winner_position", sql`${t.position} BETWEEN 1 AND 5`),
  ],
);

export const event_policy_history = sqliteTable("event_policy_history", {
  version: integer("version").primaryKey(),
  policy: text("policy").notNull(),
  actor_id: text("actor_id")
    .notNull()
    .references(() => users.id),
  created_at: text("created_at").notNull(),
  reason: text("reason").notNull(),
});

export const project_feedback_reviews = sqliteTable(
  "project_feedback_reviews",
  {
    id: text("id").primaryKey(),
    comment_id: text("comment_id")
      .notNull()
      .references(() => project_comments.id),
    version_id: text("version_id")
      .notNull()
      .references(() => submission_versions.id),
    rule_version: integer("rule_version").notNull(),
    qualified: integer("qualified").notNull(),
    body_hash: text("body_hash").notNull(),
    reviewer_id: text("reviewer_id")
      .notNull()
      .references(() => users.id),
    reason: text("reason").notNull(),
    created_at: text("created_at").notNull(),
  },
  (t) => [
    check("feedback_review_qualified", sql`${t.qualified} IN (0,1)`),
    index("feedback_review_lookup").on(
      t.comment_id,
      t.version_id,
      t.rule_version,
    ),
  ],
);

export const team_locks = sqliteTable("team_locks", {
  team_id: text("team_id")
    .primaryKey()
    .references(() => teams.id),
  locked_by: text("locked_by")
    .notNull()
    .references(() => users.id),
  locked_at: text("locked_at").notNull(),
});
export const project_commit_receipts = sqliteTable(
  "project_commit_receipts",
  {
    team_id: text("team_id")
      .notNull()
      .references(() => teams.id),
    request_key: text("request_key").notNull(),
    project_id: text("project_id")
      .notNull()
      .references(() => projects.id),
    version_id: text("version_id")
      .notNull()
      .references(() => submission_versions.id),
    created_at: text("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.team_id, t.request_key] }),
    unique().on(t.version_id),
  ],
);

export const participant_status_overrides = sqliteTable(
  "participant_status_overrides",
  {
    user_id: text("user_id")
      .primaryKey()
      .references(() => users.id),
    status: text("status").notNull(),
    reason: text("reason").notNull(),
    actor_id: text("actor_id")
      .notNull()
      .references(() => users.id),
    updated_at: text("updated_at").notNull(),
  },
  (t) => [
    check(
      "person_override_status",
      sql`${t.status} IN ('Registered','Going','Checked in','Absent')`,
    ),
  ],
);
export const manual_checkins = sqliteTable(
  "manual_checkins",
  {
    user_id: text("user_id")
      .notNull()
      .references(() => users.id),
    verified_email: text("verified_email").notNull(),
    actor_id: text("actor_id")
      .notNull()
      .references(() => users.id),
    created_at: text("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.user_id, t.verified_email] })],
);
export const team_status_overrides = sqliteTable(
  "team_status_overrides",
  {
    team_id: text("team_id")
      .primaryKey()
      .references(() => teams.id),
    status: text("status").notNull(),
    reason: text("reason").notNull(),
    rule_reference: text("rule_reference"),
    evidence: text("evidence"),
    actor_id: text("actor_id")
      .notNull()
      .references(() => users.id),
    updated_at: text("updated_at").notNull(),
  },
  (t) => [
    check(
      "team_override_status",
      sql`${t.status} IN ('Forming','Locked','Not submitted','Submitted')`,
    ),
  ],
);

export const repository_evidence = sqliteTable("repository_evidence", {
  id: text("id").primaryKey(),
  project_id: text("project_id")
    .notNull()
    .references(() => projects.id),
  version_id: text("version_id")
    .notNull()
    .references(() => submission_versions.id),
  commit_sha: text("commit_sha").notNull(),
  status: text("status").notNull(),
  evidence: text("evidence").notNull(),
  reason: text("reason").notNull(),
  actor_id: text("actor_id")
    .notNull()
    .references(() => users.id),
  created_at: text("created_at").notNull(),
});
export const eligibility_history = sqliteTable("eligibility_history", {
  id: text("id").primaryKey(),
  project_id: text("project_id")
    .notNull()
    .references(() => projects.id),
  version_id: text("version_id")
    .notNull()
    .references(() => submission_versions.id),
  status: text("status").notNull(),
  reason: text("reason").notNull(),
  evidence: text("evidence").notNull(),
  actor_id: text("actor_id")
    .notNull()
    .references(() => users.id),
  created_at: text("created_at").notNull(),
});

export const profile_photos = sqliteTable("profile_photos", {
  user_id: text("user_id")
    .primaryKey()
    .references(() => users.id),
  png: text("png").notNull(),
  updated_at: text("updated_at").notNull(),
});

export const luma_roster = sqliteTable("luma_roster", {
  email: text("email").primaryKey(),
  imported_by: text("imported_by")
    .notNull()
    .references(() => users.id),
  imported_at: text("imported_at").notNull(),
});

export const profile_details = sqliteTable("profile_details", {
  avatar_color: text("avatar_color").notNull().default("blue"),
  avatar_expression: text("avatar_expression").notNull().default("squeezed"),
  user_id: text("user_id")
    .primaryKey()
    .references(() => users.id),
  phone: text("phone").notNull().default(""),
  best_description: text("best_description").notNull().default(""),
  organization: text("organization").notNull().default(""),
  openai_org_id: text("openai_org_id").notNull().default(""),
});

// Recoverable removals keep all immutable project/attendance records intact.
export const record_removals = sqliteTable(
  "record_removals",
  {
    kind: text("kind").notNull(),
    target_id: text("target_id").notNull(),
    active: integer("active").notNull().default(1),
    reason: text("reason").notNull(),
    actor_id: text("actor_id")
      .notNull()
      .references(() => users.id),
    updated_at: text("updated_at").notNull(),
    snapshot: text("snapshot").notNull().default("{}"),
  },
  (t) => [
    primaryKey({ columns: [t.kind, t.target_id] }),
    check(
      "removal_kind",
      sql`${t.kind} IN ('participant','team','project','submission')`,
    ),
    check("removal_active", sql`${t.active} IN (0,1)`),
  ],
);
export const automatic_absences = sqliteTable("automatic_absences", {
  user_id: text("user_id")
    .primaryKey()
    .references(() => users.id),
  reconciled_at: text("reconciled_at").notNull(),
  cutoff: text("cutoff").notNull(),
});
export const roster_prefills = sqliteTable("roster_prefills", {
  email: text("email")
    .primaryKey()
    .references(() => luma_roster.email),
  payload: text("payload").notNull(),
  imported_at: text("imported_at").notNull(),
});

export const engagement_controls = sqliteTable(
  "engagement_controls",
  {
    id: integer("id").primaryKey(),
    voting_paused: integer("voting_paused").notNull().default(0),
    feedback_paused: integer("feedback_paused").notNull().default(0),
    version: integer("version").notNull().default(1),
    actor_id: text("actor_id")
      .notNull()
      .references(() => users.id),
    updated_at: text("updated_at").notNull(),
  },
  (t) => [
    check("engagement_singleton", sql`${t.id}=1`),
    check("engagement_vote_flag", sql`${t.voting_paused} IN (0,1)`),
    check("engagement_feedback_flag", sql`${t.feedback_paused} IN (0,1)`),
  ],
);

export const registration_absences = sqliteTable("registration_absences", {
  email: text("email")
    .primaryKey()
    .references(() => registrations.email),
  reconciled_at: text("reconciled_at").notNull(),
  cutoff: text("cutoff").notNull(),
});

export const credit_batches = sqliteTable(
  "credit_batches",
  {
    id: text("id").primaryKey(),
    digest: text("digest").notNull(),
    created_by: text("created_by")
      .notNull()
      .references(() => users.id),
    created_at: text("created_at").notNull(),
    deleted_at: text("deleted_at"),
  },
  (table) => [unique().on(table.created_by, table.digest)],
);
export const credit_batch_columns = sqliteTable(
  "credit_batch_columns",
  {
    batch_id: text("batch_id")
      .notNull()
      .references(() => credit_batches.id),
    type_id: text("type_id")
      .notNull()
      .references(() => credit_types.id),
    column_key: text("column_key").notNull(),
    source_heading: text("source_heading").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.batch_id, table.column_key] }),
    unique().on(table.type_id),
  ],
);
