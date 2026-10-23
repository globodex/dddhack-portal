import { z } from "zod";
import type { PortalService } from "./service";
import { one, rows, type SQL } from "./db";
import { demand, emailSchema, httpsUrl, parseCSV, sha256 } from "./security";
import { normalizePhone } from "./phone";
const fields = [
  "email",
  "displayName",
  "bio",
  "phone",
  "sex",
  "bestDescription",
  "organization",
  "openaiOrgId",
  "linkedin",
  "github",
  "x",
  "instagram",
  "website",
] as const;
const mapping = z
  .object(
    Object.fromEntries(
      fields.map((f) => [f, z.string().min(1).max(200).optional()]),
    ),
  )
  .strict();
export async function rosterImport(
  s: PortalService,
  action: string,
  input: unknown,
) {
  const actor = await s.staff(),
    d = z
      .object({
        kind: z.literal("roster"),
        csv: z.string().trim().min(1).max(512000),
        fieldMap: mapping.optional(),
        digest: z.string().optional(),
      })
      .strict()
      .parse(input);
  let parsed: string[][],
    headers: string[],
    map: Record<string, string> = Object.fromEntries(
      Object.entries(d.fieldMap || {}).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  const plain = d.csv.split(/[\s,;]+/).filter(Boolean);
  if (plain.every((v) => emailSchema.safeParse(v).success)) {
    headers = ["email"];
    parsed = plain.map((v) => [v]);
    map = { email: "email" };
  } else {
    const csv = parseCSV(d.csv);
    headers = csv[0];
    parsed = csv.slice(1);
    demand(
      new Set(headers).size === headers.length,
      422,
      "CSV_DUPLICATE_HEADERS",
    );
    if (
      !map.email &&
      headers.length === 1 &&
      headers[0].toLowerCase() === "email"
    )
      map.email = headers[0];
  }
  for (const h of Object.values(map))
    demand(headers.includes(h), 422, "CSV_MAPPING_HEADER_MISSING");
  demand(
    new Set(Object.values(map)).size === Object.values(map).length,
    422,
    "CSV_MAPPING_DUPLICATE",
  );
  const errors: { row?: number; message: string }[] = [],
    prepared: {
      row: number;
      email: string;
      prefill: Record<string, unknown>;
    }[] = [];
  if (!map.email)
    errors.push({
      message:
        "Map the actual email column before importing. No header names were guessed.",
    });
  const seen = new Set<string>();
  let duplicates = 0;
  if (map.email)
    for (const [index, row] of parsed.entries()) {
      const value = (key: string) =>
        map[key] ? row[headers.indexOf(map[key])]?.trim() || "" : "";
      const email = emailSchema.safeParse(value("email"));
      if (!email.success) {
        errors.push({ row: index + 2, message: "A valid email is required." });
        continue;
      }
      if (seen.has(email.data)) {
        duplicates++;
        continue;
      }
      seen.add(email.data);
      const prefill: Record<string, unknown> = {};
      for (const [key, max] of [
        ["displayName", 120],
        ["bio", 200],
        ["bestDescription", 120],
        ["organization", 200],
        ["openaiOrgId", 120],
      ] as const) {
        const v = value(key);
        if (v) {
          if (v.length > max || /[\r\n]/.test(v)) {
            errors.push({
              row: index + 2,
              message: `${key} must be a single line of at most ${max} characters.`,
            });
          } else prefill[key] = v;
        }
      }
      const phone = value("phone");
      if (phone) {
        try {
          prefill.phone = normalizePhone(phone);
        } catch {
          errors.push({
            row: index + 2,
            message: "Phone must include a valid international country code.",
          });
        }
      }
      const sex = value("sex").toLowerCase();
      if (sex) {
        const gender = (
          {
            male: "man",
            female: "woman",
            "non-binary": "non-binary",
          } as Record<string, string>
        )[sex];
        if (gender) prefill.gender = gender;
        else
          errors.push({
            row: index + 2,
            message: "Sex must be Male, Female or Non-binary.",
          });
      }
      const socialLinks: { type: string; url: string }[] = [];
      for (const [key, type] of [
        ["linkedin", "LinkedIn"],
        ["github", "GitHub"],
        ["x", "X"],
        ["instagram", "Instagram"],
        ["website", "Website"],
      ]) {
        const v = value(key);
        if (v) {
          const link = httpsUrl.safeParse(v);
          if (link.success) socialLinks.push({ type, url: link.data });
          else
            errors.push({
              row: index + 2,
              message: `${type} requires a safe HTTPS URL.`,
            });
        }
      }
      if (socialLinks.length) prefill.socialLinks = socialLinks;
      prepared.push({ row: index + 2, email: email.data, prefill });
    }
  const existing = new Set(
    (
      await rows<{ email: string }>(
        s.db,
        "SELECT email FROM registrations UNION SELECT email FROM luma_roster",
      )
    ).map((r) => r.email.toLowerCase()),
  );
  const removed = new Set(
    (
      await rows<{ email: string }>(
        s.db,
        "SELECT u.email FROM users u JOIN record_removals r ON r.target_id=u.id AND r.kind='participant' AND r.active=1",
      )
    ).map((r) => r.email),
  );
  const digest = await sha256(
    JSON.stringify({ headers, map, prepared, errors }),
  );
  const counts = {
    new: prepared.filter((r) => !existing.has(r.email) && !removed.has(r.email))
      .length,
    existing: prepared.filter(
      (r) => existing.has(r.email) || removed.has(r.email),
    ).length,
    invalid: errors.length,
    duplicates,
    prefills: prepared.filter(
      (r) =>
        !existing.has(r.email) &&
        !removed.has(r.email) &&
        Object.keys(r.prefill).length,
    ).length,
  };
  if (action === "preview-import") {
    if (!errors.length)
      await s.mutate(
        actor.id,
        action,
        digest,
        [
          [
            "INSERT INTO import_previews VALUES(?,?,?) ON CONFLICT(actor_id,digest) DO UPDATE SET created_at=excluded.created_at",
            actor.id,
            digest,
            s.now(),
          ],
        ],
        { kind: "roster", count: prepared.length },
      );
    return {
      digest,
      headers,
      fieldMap: map,
      counts,
      rows: prepared.map((r) => ({
        row: r.row,
        email: r.email,
        existing: existing.has(r.email) || removed.has(r.email),
        action: removed.has(r.email)
          ? "Skip removed participant; no access restored"
          : existing.has(r.email)
            ? "Skip all existing participant fields and statuses"
            : "Add Registered participant",
        rosterMatched: existing.has(r.email),
      })),
      errors,
    };
  }
  demand(
    !errors.length &&
      d.digest === digest &&
      (await one(
        s.db,
        "SELECT digest FROM import_previews WHERE actor_id=? AND digest=? AND created_at>?",
        actor.id,
        digest,
        new Date(Date.parse(s.now()) - 15 * 60000).toISOString(),
      )),
    409,
    "PREVIEW_REQUIRED",
  );
  const values = JSON.stringify(
    prepared
      .filter((r) => !removed.has(r.email))
      .map((r) => ({ email: r.email, prefill: r.prefill })),
  );
  const newValues = JSON.stringify(
    prepared.filter((r) => !existing.has(r.email) && !removed.has(r.email)),
  );
  const sql: SQL[] = [
    [
      "INSERT INTO luma_roster SELECT json_extract(value,'$.email'),?,? FROM json_each(?) WHERE NOT EXISTS(SELECT 1 FROM users u JOIN record_removals r ON r.target_id=u.id AND r.kind='participant' AND r.active=1 WHERE u.email=json_extract(value,'$.email')) ON CONFLICT DO NOTHING",
      actor.id,
      s.now(),
      values,
    ],
    [
      "INSERT INTO roster_prefills SELECT json_extract(value,'$.email'),json_extract(value,'$.prefill'),? FROM json_each(?) WHERE EXISTS(SELECT 1 FROM luma_roster l WHERE l.email=json_extract(value,'$.email') AND l.imported_by=? AND l.imported_at=?) AND NOT EXISTS(SELECT 1 FROM registrations r WHERE r.email=json_extract(value,'$.email')) ON CONFLICT DO NOTHING",
      s.now(),
      newValues,
      actor.id,
      s.now(),
    ],
    [
      "INSERT INTO registrations(email) SELECT json_extract(value,'$.email') FROM json_each(?) WHERE true ON CONFLICT DO NOTHING",
      values,
    ],
    [
      "DELETE FROM import_previews WHERE actor_id=? AND digest=?",
      actor.id,
      digest,
    ],
  ];
  await s.mutate(actor.id, action, digest, sql, {
    kind: "roster",
    count: prepared.length,
    addOnly: true,
  });
  return {
    message:
      "Add-only roster import committed. Existing profiles, statuses and removed accounts were preserved.",
  };
}
