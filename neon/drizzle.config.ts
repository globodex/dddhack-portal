import { defineConfig } from "drizzle-kit";

// Use generate for review only. Apply reviewed SQL with neon/scripts/migrate.ts;
// drizzle-kit push would omit the required PL/pgSQL invariants.
export default defineConfig({
  dialect: "postgresql",
  schema: "./neon/db/schema.ts",
  out: "./neon/drizzle-generated",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED || "" },
  strict: true,
});
