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
