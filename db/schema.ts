// Logical schema for Sites/Drizzle. Triggers remain in the reviewed SQL migration.
import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
  unique,
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
