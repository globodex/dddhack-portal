import { one, rows, type Database } from "./db";
import { teamPhone } from "./phone";
import { demand, PortalError } from "./security";
import { registeredEmailPredicate } from "./roster";

export type DiscoverParticipantOptions = {
  cursor?: string;
  limit?: number;
  membership?: string;
  person?: string;
};
export type PortalViewOptions = DiscoverParticipantOptions & {
  search?: string;
  page?: number;
  focus?: string;
};
type Membership = "all" | "in" | "out";
type Cursor = {
  v: 1;
  name: string;
  id: string;
  q: string;
  membership: Membership;
};
type DirectoryRow = {
  id: string;
  name: string;
  avatarColor: string;
  avatarExpression: string;
  teamName: string | null;
  teamPalette: string | null;
  teamStatus: "In a team" | "Not in a team";
  bio: string;
  socials: string;
};

export function participantPagingFromParams(
  params: URLSearchParams,
): DiscoverParticipantOptions {
  const raw = params.get("limit");
  demand(
    raw === null || /^[1-9]\d*$/.test(raw),
    422,
    "INVALID_DIRECTORY_LIMIT",
  );
  const limit = raw === null ? undefined : Number(raw);
  demand(
    limit === undefined || (Number.isSafeInteger(limit) && limit <= 48),
    422,
    "INVALID_DIRECTORY_LIMIT",
  );
  return {
    ...(limit === undefined ? {} : { limit }),
    cursor: params.get("cursor") || undefined,
    membership: params.get("membership") || "all",
    person: params.get("person") || undefined,
  };
}

function encodeCursor(cursor: Cursor) {
  return btoa(
    String.fromCharCode(...new TextEncoder().encode(JSON.stringify(cursor))),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function decodeCursor(
  value: string,
  q: string,
  membership: Membership,
): Cursor {
  try {
    demand(
      value.length <= 2048 && /^[A-Za-z0-9_-]+$/.test(value),
      422,
      "INVALID_DIRECTORY_CURSOR",
    );
    const bytes = Uint8Array.from(
      atob(value.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    );
    const c = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    demand(
      c &&
        typeof c === "object" &&
        !Array.isArray(c) &&
        Object.keys(c).sort().join(",") === "id,membership,name,q,v" &&
        c.v === 1 &&
        typeof c.name === "string" &&
        c.name.length <= 200 &&
        typeof c.id === "string" &&
        c.id.length > 0 &&
        c.id.length <= 150 &&
        c.q === q &&
        c.membership === membership,
      422,
      "INVALID_DIRECTORY_CURSOR",
    );
    return c;
  } catch {
    throw new PortalError(
      422,
      "INVALID_DIRECTORY_CURSOR",
      "This directory cursor is invalid or belongs to another search. Refresh the directory.",
    );
  }
}

// Directory pages/search keep this public allowlist. Only an explicit selected
// lookup can add authorized facts; soft removals are re-read for both paths.
const selection = `SELECT u.id,COALESCE(pp.display_name,u.name) name,
 pd.avatar_color avatarColor,pd.avatar_expression avatarExpression,
 t.name teamName,COALESCE(ts.color_key,ts.palette) teamPalette,
 CASE WHEN m.team_id IS NULL THEN 'Not in a team' ELSE 'In a team' END teamStatus,
 CASE WHEN p.public=1 THEN p.bio ELSE '' END bio,
 CASE WHEN p.public=1 THEN p.socials ELSE '[]' END socials
 FROM users u
 JOIN participant_profiles pp ON pp.user_id=u.id
 LEFT JOIN portal_roles r ON r.user_id=u.id
 JOIN profiles p ON p.user_id=u.id
 JOIN profile_details pd ON pd.user_id=u.id
 LEFT JOIN memberships m ON m.user_id=u.id
 LEFT JOIN teams t ON t.id=m.team_id
 LEFT JOIN team_styles ts ON ts.team_id=t.id
 WHERE COALESCE(r.role,u.role)='participant'
 AND ${registeredEmailPredicate("u.email")}
 AND NOT EXISTS(SELECT 1 FROM record_removals rr WHERE rr.kind='participant' AND rr.target_id=u.id AND rr.active=1)
 AND pp.completed_at IS NOT NULL AND pd.phone<>''`;
const name = "COALESCE(pp.display_name,u.name) COLLATE NOCASE";
const project = (row: DirectoryRow) => ({
  ...row,
  socials: JSON.parse(row.socials),
});

// Supplied only by the freshly authenticated service actor, never query params.
type ProfileViewer = { id: string; role: string; owner?: boolean; deactivated?: boolean; canParticipate?: boolean };
async function selectedPerson(db: Database, row: DirectoryRow, viewer?: ProfileViewer) {
  const publicPerson = project(row);
  const admin = !!viewer && !viewer.deactivated && (viewer.owner || viewer.role === "admin");
  const participant = !!viewer && !viewer.deactivated && viewer.canParticipate === true;
  if (!viewer) return { ...publicPerson, details: {} };
  const self = participant && viewer!.id === row.id;
  const extra = await one<{
    bio: string; socials: string; gender: string; genderDescription: string;
    profession: string; organization: string; openaiOrgId: string; phone: string; sameTeam: number;
  }>(db, `SELECT p.bio,p.socials,p.gender,p.gender_description genderDescription,
    pd.best_description profession,pd.organization,pd.openai_org_id openaiOrgId,pd.phone,
    CASE WHEN EXISTS(SELECT 1 FROM memberships target JOIN memberships viewer ON viewer.team_id=target.team_id WHERE target.user_id=? AND viewer.user_id=?) THEN 1 ELSE 0 END sameTeam
    FROM profiles p JOIN profile_details pd ON pd.user_id=p.user_id WHERE p.user_id=?`, row.id, viewer!.id, row.id);
  if (!extra) return { ...publicPerson, details: {} };
  const personal = admin || self;
  return {
    ...publicPerson,
    ...(personal ? { bio: extra.bio, socials: JSON.parse(extra.socials || "[]") } : {}),
    details: {
      // The owner explicitly approved the saved gender value in selected profiles.
      // This does not add it to directory cards or publish the freeform description.
      ...(extra.gender ? { gender: extra.gender } : {}),
      ...(personal ? {
        ...(extra.profession?.trim() ? { profession: extra.profession } : {}),
        ...(extra.organization?.trim() ? { organization: extra.organization } : {}),
        ...(extra.genderDescription?.trim() ? { genderDescription: extra.genderDescription } : {}),
      } : {}),
      ...(admin && /^org-[A-Za-z0-9_-]+$/.test(extra.openaiOrgId || "") ? { openaiOrgId: extra.openaiOrgId } : {}),
      ...(admin || (participant && extra.sameTeam === 1) ? teamPhone(extra.phone) : {}),
    },
  };
}

export async function discoverParticipants(
  db: Database,
  options: PortalViewOptions = {},
  viewer?: ProfileViewer,
) {
  const limit = options.limit ?? 24;
  demand(
    Number.isSafeInteger(limit) && limit >= 1 && limit <= 48,
    422,
    "INVALID_DIRECTORY_LIMIT",
  );
  const membership = options.membership || "all";
  demand(
    ["all", "in", "out"].includes(membership),
    422,
    "INVALID_DIRECTORY_MEMBERSHIP",
  );
  const q = (options.search || "").slice(0, 200).trim();
  const cursor = options.cursor
    ? decodeCursor(options.cursor, q, membership as Membership)
    : undefined;
  demand(
    options.person === undefined ||
      (typeof options.person === "string" &&
        options.person.length > 0 &&
        options.person.length <= 150),
    422,
    "INVALID_DIRECTORY_PERSON",
  );
  const filters = [
    "instr(lower(COALESCE(pp.display_name,u.name) || ' ' || COALESCE(t.name,'') || ' ' || CASE WHEN p.public=1 THEN p.bio ELSE '' END),lower(?))>0",
  ];
  const args: unknown[] = [q];
  if (membership !== "all")
    filters.push(`m.team_id IS ${membership === "in" ? "NOT " : ""}NULL`);
  if (cursor) {
    filters.push(`(${name}>? OR (${name}=? AND u.id>?))`);
    args.push(cursor.name, cursor.name, cursor.id);
  }
  const found = await rows<DirectoryRow>(
    db,
    `${selection} AND ${filters.join(" AND ")} ORDER BY ${name},u.id LIMIT ?`,
    ...args,
    limit + 1,
  );
  const hasMore = found.length > limit;
  const page = found.slice(0, limit);
  const last = page.at(-1);
  const focused = options.person ? (await rows<DirectoryRow>(db, `${selection} AND u.id=? LIMIT 1`, options.person))[0] : undefined;
  return {
    items: page.map(project),
    limit,
    hasMore,
    nextCursor:
      hasMore && last
        ? encodeCursor({
            v: 1,
            name: last.name,
            id: last.id,
            q,
            membership: membership as Membership,
          })
        : null,
    ...(options.person
      ? {
          focusedPerson: focused ? await selectedPerson(db, focused, viewer) : null,
        }
      : {}),
  };
}
