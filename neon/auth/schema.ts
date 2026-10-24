import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  unique,
} from "drizzle-orm/pg-core";
import { users } from "../db/schema";

export const authUsers = pgTable(
  "auth_users",
  {
    id: text("id")
      .primaryKey()
      .references(() => users.id),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    emailVerifiedAt: text("email_verified_at").notNull(),
  },
  (t) => [
    check("auth_email_normalized", sql`${t.email}=lower(trim(${t.email}))`),
  ],
);
export const authAccounts = pgTable(
  "auth_accounts",
  {
    provider: text("provider").notNull(),
    providerSubject: text("provider_subject").notNull(),
    authUserId: text("auth_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.providerSubject] }),
    unique().on(t.authUserId, t.provider),
    check("auth_google_provider", sql`${t.provider}='google'`),
  ],
);
export const authSessions = pgTable(
  "auth_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    authUserId: text("auth_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  },
  (t) => [
    index("auth_sessions_expiry").on(t.expiresAt),
    index("auth_sessions_user").on(t.authUserId),
  ],
);
export const authMagicTokens = pgTable(
  "auth_magic_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    email: text("email").notNull(),
    browserHash: text("browser_hash").notNull(),
    returnTo: text("return_to").notNull(),
    expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  },
  (t) => [
    index("auth_magic_expiry").on(t.expiresAt),
    index("auth_magic_email").on(t.email),
    check(
      "auth_magic_email_normalized",
      sql`${t.email}=lower(trim(${t.email}))`,
    ),
  ],
);
export const authOauthTransactions = pgTable(
  "auth_oauth_transactions",
  {
    stateHash: text("state_hash").primaryKey(),
    browserHash: text("browser_hash").notNull(),
    nonce: text("nonce").notNull(),
    pkceVerifier: text("pkce_verifier").notNull(),
    returnTo: text("return_to").notNull(),
    expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  },
  (t) => [index("auth_oauth_expiry").on(t.expiresAt)],
);
export const authRateLimits = pgTable(
  "auth_rate_limits",
  {
    bucket: text("bucket").primaryKey(),
    count: integer("count").notNull(),
    expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  },
  (t) => [
    index("auth_rate_expiry").on(t.expiresAt),
    check("auth_rate_positive", sql`${t.count}>0`),
  ],
);
