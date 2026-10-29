import { adminDemographics, hasDemographics, matchingDemographicPeople, matchesAdminParticipant } from "./admin-demographic-filters";
import {
  isProjectMediaCommand,
  PROJECT_MEDIA_DEFAULT_JSON_BYTES,
  PROJECT_MEDIA_MAX_PROJECT_JSON_BYTES,
} from "./project-media-policy";
import {
  participantExportSelection,
  participantCSV,
} from "./participant-export";
import { z } from "zod";
import { PortalService } from "./service";
import { prepareAdminPresentation } from "./admin-presentation";
import {
  queueEvaluations,
  type BackgroundDispatch,
} from "./evaluation-background";
import { participantPagingFromParams } from "./discover-participants";
import {
  PortalError,
  checkMutationRequest,
  csvExport,
  demand,
} from "./security";
import type { Database } from "./db";
import type { Identity } from "./identity";
import { sitesIdentity } from "./identity";
import type { Evaluator } from "./evaluation";
export type Runtime = {
  db: Database;
  identity: Identity | null;
  key: string | undefined;
  localTest?: boolean;
  background?: BackgroundDispatch;
  evaluator?: Evaluator;
};
const safeHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  Vary: "Cookie, oai-authenticated-user-id",
};
function errorResponse(error: unknown) {
  if (error instanceof z.ZodError)
    return Response.json(
      {
        code: "VALIDATION_ERROR",
        message: error.issues
          .map((i) => i.path.join(".") + ": " + i.message)
          .join("; "),
      },
      { status: 422, headers: safeHeaders },
    );
  if (error instanceof SyntaxError)
    return Response.json(
      { code: "INVALID_JSON", message: "The request contains invalid JSON." },
      { status: 422, headers: safeHeaders },
    );
  if (error instanceof PortalError)
    return Response.json(
      { code: error.code, message: error.message },
      { status: error.status, headers: safeHeaders },
    );
  const msg = error instanceof Error ? error.message : "";
  const constraint = msg.match(
    /ENGAGEMENT_PAUSED|FEEDBACK_TOO_SHORT|RECORD_REMOVED|PARTICIPANT_REMOVED|LEADER_CHECKIN_REQUIRED|OWN_PROJECT_CHECKIN_REQUIRED|PROJECT_LOCKED_AFTER_THIRD_SUBMISSION|TEAM_LOCKED|TEAM_CHECKIN_REQUIRED|OPERATION_NOT_ENABLED|TEAM_FULL|APPROVAL_REQUIRED|MEMBERSHIP_FROZEN|ALREADY_IN_TEAM|IDEA_LOCKED|SUBMISSIONS_CLOSED|EVENT_DRAFT|VOTE_LIMIT|OWN_TEAM|CHECKIN_REQUIRED|RESULTS_FROZEN|SCORING_CHANGED_RETRY|IMMUTABLE/,
  );
  if (constraint || /constraint|UNIQUE|CHECK/.test(msg))
    return Response.json(
      {
        code: constraint?.[0] || "CONFLICT",
        message:
          constraint?.[0] ||
          "A limit or duplicate record prevented this action. No changes were committed.",
      },
      { status: 409, headers: safeHeaders },
    );
  return Response.json(
    {
      code: "REQUEST_FAILED",
      message:
        "The request could not be completed. No secret values are included in this error.",
    },
    { status: 500, headers: safeHeaders },
  );
}
async function readBody(request: Request) {
  const reader = request.body?.getReader();
  demand(reader, 422, "EMPTY_BODY");
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > PROJECT_MEDIA_MAX_PROJECT_JSON_BYTES) {
      await reader.cancel();
      throw new PortalError(413, "BODY_TOO_LARGE");
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    combined.set(c, at);
    at += c.length;
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(combined));
  } catch (error) {
    demand(length <= PROJECT_MEDIA_DEFAULT_JSON_BYTES, 413, "BODY_TOO_LARGE");
    throw error;
  }
  // Read at most the explicit project envelope. Other commands retain their old cap.
  demand(
    length <= PROJECT_MEDIA_DEFAULT_JSON_BYTES ||
      (value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.hasOwn(value, "action") &&
        isProjectMediaCommand((value as { action: unknown }).action)),
    413,
    "BODY_TOO_LARGE",
  );
  return value;
}
export async function handlePortal(request: Request, runtime: Runtime) {
  try {
    const service = new PortalService(
      runtime.db,
      runtime.identity,
      runtime.key,
      undefined,
      runtime.evaluator,
    );
    if (request.method === "GET") {
      const params = new URL(request.url).searchParams;
      const view = params.get("view") || "/";
      const options = {
        gender: params.get("gender") || "",
        profession: params.get("profession") || "",
        participantStatus: params.get("participantStatus") || "",
        teamStatus: params.get("teamStatus") || "",
        teamSize: params.get("teamSize") || "",
        ...((view.replace(/\/+/g, "/").replace(/\/$/, "") || "/") === "/" &&
        params.get("arrival") === "1"
          ? { includePrivateVenue: true }
          : {}),
        ...(view.replace(/\/+/g, "/").replace(/\/$/, "") ===
        "/discover/participants"
          ? participantPagingFromParams(params)
          : {}),
        focus: (new URL(request.url).searchParams.get("focus") || "").slice(
          0,
          150,
        ),
        search: (new URL(request.url).searchParams.get("q") || "").slice(
          0,
          200,
        ),
        page: Math.min(
          1000,
          Math.max(
            0,
            Number(new URL(request.url).searchParams.get("page")) || 0,
          ),
        ),
      };
      const projected = await service.view(view, options);
      const optimized = await prepareAdminPresentation(
        projected,
        view,
        { search: options.search, page: options.page, focus: options.focus, ...(options.gender || options.profession || options.participantStatus || options.teamStatus || options.teamSize ? {gender: options.gender, profession: options.profession, participantStatus: options.participantStatus, teamStatus: options.teamStatus, teamSize: options.teamSize} : {}) },
        params.get("presentation") || undefined,
      );
      return Response.json(
        {
          ...optimized,
          localTest: !!runtime.localTest,
        },
        { headers: safeHeaders },
      );
    }
    demand(request.method === "POST", 405, "METHOD_NOT_ALLOWED");
    checkMutationRequest(request);
    const { action, data } = z
      .object({ action: z.string().max(80), data: z.unknown() })
      .strict()
      .parse(await readBody(request));
    if (action === "local-signout") {
      demand(runtime.localTest, 404, "NOT_FOUND");
      return Response.json(
        { message: "Local test identity cleared." },
        {
          headers: {
            ...safeHeaders,
            "Set-Cookie":
              "portal_local_fixture=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0",
          },
        },
      );
    }
    if (action === "local-signin") {
      demand(runtime.localTest, 404, "NOT_FOUND");
      const { fixture } = z
        .object({
          fixture: z.enum([
            "owner",
            "admin",
            "judge",
            "judge2",
            "alice",
            "bob",
            "carol",
            "dave",
            "eve",
            "frank",
            "pending",
            "stranger",
          ]),
        })
        .parse(data);
      return Response.json(
        { message: "Fake local identity selected." },
        {
          headers: {
            ...safeHeaders,
            "Set-Cookie": `portal_local_fixture=${fixture}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800`,
          },
        },
      );
    }
    if (action === "astra-process") {
      demand(runtime.background, 503, "BACKGROUND_PROCESSING_UNAVAILABLE");
      return Response.json(
        await queueEvaluations(service, data, runtime.background),
        { status: 202, headers: safeHeaders },
      );
    }
    return Response.json(await service.command(action, data), {
      headers: safeHeaders,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function handleExport(request: Request, runtime: Runtime) {
  try {
    const service = new PortalService(
      runtime.db,
      runtime.identity,
      runtime.key,
    );
    const actor = await service.staff();
    const list = new URL(request.url).searchParams.get("list") || "";
    demand(
      [
        "participants",
        "credits",
        "teams",
        "team-emails",
        "submissions",
        "settings",
        "permissions",
        "audit",
        "logs",
      ].includes(list),
      403,
      "EXPORT_NOT_PERMITTED",
    );
    if (list === "audit" || list === "logs") await service.staff(true);
    if (["settings", "permissions"].includes(list)) await service.staff(true);
    const exportParams = new URL(request.url).searchParams;
    const demographics = adminDemographics({ gender: exportParams.get("gender") || "", profession: exportParams.get("profession") || "", participantStatus: exportParams.get("participantStatus") || "", teamStatus: exportParams.get("teamStatus") || "", teamSize: exportParams.get("teamSize") || "" });
    if (demographics.teamSize) demand(["teams", "team-emails"].includes(list), 422, "TEAM_SIZE_FILTER_ROUTE_REQUIRED");
    if (hasDemographics(demographics)) {
      demand(["participants", "teams", "team-emails", "submissions"].includes(list), 422, "ADMIN_FILTER_ROUTE_REQUIRED");
      await service.staff();
    }
    let data: Record<string, unknown>[];
    if (hasDemographics(demographics) && ["teams", "team-emails", "submissions"].includes(list)) {
      const selected = ((await service.view("/admin/" + (list === "team-emails" ? "teams" : list), demographics))?.items || []) as Record<string, any>[];
      data = list === "team-emails" ? selected.flatMap(team => team.members.map((member: Record<string, unknown>) => ({ email: member.email, team: team.name, status: team.status, teamStatus: team.status, teamLocked: team.locked }))) : selected;
    } else {
      data = await service.adminList(list === "logs" ? "audit" : list);
      if (hasDemographics(demographics) && list === "participants") {
        const matching = demographics.gender || demographics.profession ? await matchingDemographicPeople(runtime.db, {gender: demographics.gender, profession: demographics.profession}) : null;
        data = data.filter(row => (!matching || (typeof row.id === "string" && matching.has(row.id))) && matchesAdminParticipant(row, demographics));
      }
    }
    if (list === "participants") {
      const selection = participantExportSelection(
        data,
        new URL(request.url).searchParams,
      );
      // Re-read authorization after asynchronous projection/filter work.
      await service.staff();
      await service.mutate(actor.id, "export", list, [], {
        rows: selection.exported,
        totalMatches: selection.total,
        scope: selection.scope,
        page: selection.scope === "page" ? selection.page : undefined,
        pageSize: selection.scope === "page" ? selection.pageSize : undefined,
        secretValues: false,
      });
      return new Response(participantCSV(selection.rows), {
        headers: {
          ...safeHeaders,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=devday-participants.csv",
          "X-Total-Count": String(selection.total),
          "X-Exported-Count": String(selection.exported),
          "X-Export-Scope": selection.scope,
          ...(selection.scope === "page"
            ? {
                "X-Page": String(selection.page),
                "X-Page-Size": String(selection.pageSize),
              }
            : {}),
        },
      });
    }
    const query = (new URL(request.url).searchParams.get("q") || "")
      .slice(0, 200)
      .toLowerCase();
    const status = (
      new URL(request.url).searchParams.get("status") || ""
    ).slice(0, 40);
    const params = new URL(request.url).searchParams,
      teamStatus = (params.get("teamStatus") || "").slice(0, 40),
      lock = params.get("lock");
    data = data.filter(
      (row) =>
        (!query || JSON.stringify(row).toLowerCase().includes(query)) &&
        (!status || row.status === status) &&
        (!teamStatus || hasDemographics(demographics) || row.teamStatus === teamStatus) &&
        (!lock ||
          (lock === "locked"
            ? row.teamLocked === true || row.locked === true
            : row.teamLocked === false || row.locked === false)),
    );
    if (list === "team-emails")
      data = data.map((row) => ({ email: row.email }));
    await service.mutate(actor.id, "export", list, [], {
      rows: data.length,
      secretValues: false,
    });
    return new Response(csvExport(data), {
      headers: {
        ...safeHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="devday-${list}.csv"`,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
// Testable adapter for callers already inside the trusted Sites Dispatch boundary.
// App Router routes use getSitesRuntime() from the Worker request scope.
export function createSitesPortalHandler(env: {
  DB: Database;
  CREDIT_ENCRYPTION_KEY?: string;
  PORTAL_RUNTIME?: string;
  PORTAL_TRUST_SITES_DISPATCH?: string;
}) {
  return async (request: Request) => {
    try {
      const identity = sitesIdentity(request, env);
      const runtime = { db: env.DB, identity, key: env.CREDIT_ENCRYPTION_KEY };
      return new URL(request.url).pathname === "/api/export"
        ? handleExport(request, runtime)
        : handlePortal(request, runtime);
    } catch (e) {
      return errorResponse(e);
    }
  };
}
