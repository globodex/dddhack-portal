// Explicit disposable browser-review data. This script never contacts a hosted service.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { LocalDatabase } from "../lib/local-test/sqlite";
import { seedLocal } from "./fixtures";
import { seedRichVisual, seedMockupReview } from "./visual-rich-fixtures";
import { seedControlProjects } from "./control-project-fixtures";

if (process.env.PORTAL_LOCAL_TEST !== "1" || process.env.NODE_ENV === "production")
  throw new Error("EXPLICIT_SYNTHETIC_LOCAL_MODE_REQUIRED");
const path = resolve(process.env.PORTAL_REDESIGN_DB || "/tmp/ddd-redesign-rich.sqlite");
if (!path.startsWith("/tmp/") || existsSync(path))
  throw new Error("NEW_DISPOSABLE_TMP_DATABASE_REQUIRED");
const db = new LocalDatabase(path);
try {
  db.migrate();
  await seedLocal(db);
  await seedRichVisual(db);
  await seedMockupReview(db);
  await seedControlProjects(db);
  const bios = [
    "Building practical tools for small communities.",
    "Designing thoughtful interfaces and useful systems.",
    "Exploring accessible AI for everyday work.",
    "Turning ambitious ideas into working prototypes.",
  ];
  const colors = ["blue", "green", "purple", "orange", "grey", "coral", "yellow", "charcoal"];
  const expressions = ["squeezed", "sleepy", "plus", "star", "cheerful", "mixed-plus", "mixed-slash", "round"];
  for (const [index, suffix] of ["alice", "bob", "carol", "dave", "eve", "frank", "gina", "hari", "ivy", "pending"].entries()) {
    const id = `fake_${suffix}`;
    await db.prepare("UPDATE profiles SET public=1,bio=?,socials=? WHERE user_id=?").bind(
      bios[index % bios.length], JSON.stringify([`https://github.com/example-${suffix}`, `https://www.linkedin.com/in/example-${suffix}`]), id,
    ).all();
    await db.prepare("UPDATE profile_details SET avatar_color=?,avatar_expression=?,best_description='Independent Developer',organization='Synthetic Studio' WHERE user_id=?").bind(colors[index % colors.length], expressions[index % expressions.length], id).all();
  }
  // Retain at least one private profile so directory privacy is tested separately.
  await db.prepare("UPDATE profiles SET public=0,bio='SYNTHETIC PRIVATE BIO' WHERE user_id='fake_owner'").all();
  console.log(JSON.stringify({ path, syntheticOnly: true, newDatabase: true, baseSource: "696b125f9711a4fd6e02c3ece3adadb18b83cba7" }));
} finally { db.close(); }
