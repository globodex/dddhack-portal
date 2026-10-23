import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unstable_dev, getPlatformProxy } from "wrangler";
import { syntheticImage } from "../tests/fixture-images.ts";
import { seedLocal } from "./fixtures.ts";
process.env.PORTAL_LOCAL_TEST = "1"; // Cannot reactivate code removed by the production build.
process.env.CLOUDFLARE_CF_FETCH_ENABLED = "false";
process.env.WRANGLER_SEND_METRICS = "false";
const persistTo = mkdtempSync(join(tmpdir(), "portal-worker-smoke-"));
const options = {
  config: "dist/server/wrangler.json",
  envFiles: [],
  local: true,
  ip: "127.0.0.1",
  port: 0,
  inspectorPort: 0,
  logLevel: "error",
  persist: true,
  persistTo,
  experimental: {
    disableExperimentalWarning: true,
    disableDevRegistry: true,
    testMode: true,
    watch: false,
  },
};
let worker;
const report = {
  source: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  workerSha256: createHash("sha256").update(readFileSync("dist/server/index.js")).digest("hex"),
  syntheticOnly: true,
  publicationPerformed: false,
};
const spoof = {
  "oai-authenticated-user-id": "attacker",
  "oai-authenticated-user-email": "connectwithparam.30@gmail.com",
  cookie: "portal_local_fixture=owner; __sites_local_auth=1",
};
try {
  worker = await unstable_dev("dist/server/index.js", options);
  const landing = await worker.fetch("/");
  assert.equal(landing.status, 200);
  const landingHTML = await landing.text();
  assert.match(landingHTML, /DevDay Exchange/);
  assert.match(landingHTML, /DevDay Exchange Community Hackathon: New Delhi/);
  for (const path of [
    "/dashboard/credits",
    "/admin/permissions",
    "/judge",
    "/api/portal?view=/admin/permissions",
    "/api/export?list=credits",
  ]) {
    const response = await worker.fetch(path, {
      headers: spoof,
      redirect: "manual",
    });
    assert.equal(response.status, 503, path);
    assert.equal((await response.json()).code, "SITES_DISPATCH_NOT_CONFIGURED");
  }
  assert.equal((await worker.fetch("/local-test")).status, 404);
  const compilerEndpoints = [
    "/@vite/client",
    "/@fs/package.json",
    "/esbuild",
    "/__sites_connector_preview/context",
  ];
  for (const endpoint of compilerEndpoints) {
    const response = await worker.fetch(endpoint);
    const body = await response.text();
    assert.notEqual(response.headers.get("content-type"), "text/event-stream");
    assert(
      !body.includes("import.meta.hot"),
      endpoint + " exposed Vite client source",
    );
    assert(
      !body.includes('"dependencies":'),
      endpoint + " exposed package/source data",
    );
  }
  report.standalone = {
    landing: 200,
    forgedOwnerHeadersAccepted: false,
    localAdapterEnabledByEnvironmentOrCookie: false,
    privatePagesAndAPIs: 503,
    localTestRoute: 404,
    compilerEndpointsExposeSourceOrEventStream: false,
  };
  await worker.stop();
  worker = undefined;

  // An isolated synthetic Dispatch harness. Its identity headers are test input,
  // not proof of real ChatGPT sign-in, and these vars never enter hosted config.
  const platform = await getPlatformProxy({
    configPath: "dist/server/wrangler.json",
    envFiles: [],
    remoteBindings: false,
    persist: { path: join(persistTo, "v3") },
  });
  try {
    for (const file of readdirSync("drizzle")
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      for (const sql of readFileSync("drizzle/" + file, "utf8")
        .split("--> statement-breakpoint")
        .filter((s) => s.trim()))
        await platform.env.DB.prepare(sql).all();
    }
    await seedLocal(platform.env.DB);
    // Mirror fresh production: profile/sign-in must work before owner setup.
    await platform.env.DB.prepare("DELETE FROM event_settings").all();
  } finally {
    await platform.dispose();
  }
  worker = await unstable_dev("dist/server/index.js", {
    ...options,
    vars: {
      PORTAL_RUNTIME: "sites",
      PORTAL_TRUST_SITES_DISPATCH: "true",
    },
  });
  const anon = await worker.fetch("/dashboard", { redirect: "manual" });
  assert.equal(anon.status, 302);
  assert.match(
    anon.headers.get("location"),
    /\/signin-with-chatgpt\?return_to=%2Fdashboard$/,
  );
  assert.match(anon.headers.get("cache-control"), /no-store/);
  const alice = {
    "oai-authenticated-user-id": "fake_alice",
    "oai-authenticated-user-email": "alice@portal.test",
  };
  const adminDenied = await worker.fetch("/admin/permissions", {
    headers: alice,
  });
  assert.equal(adminDenied.status, 403, await adminDenied.text());
  const dashboard = await worker.fetch("/dashboard/profile", {
    headers: alice,
  });
  assert.equal(dashboard.status, 200);
  assert.equal(
    (await worker.fetch("/dashboard", { headers: alice })).status,
    200,
  );
  assert.match(dashboard.headers.get("cache-control"), /no-store/);
  const profile = await worker.fetch("/api/portal?view=/dashboard/profile", {
    headers: alice,
  });
  assert.equal(profile.status, 200);
  assert.equal((await profile.json()).me.id, "fake_alice");
  assert.equal(
    (await worker.fetch("/api/portal?view=/dashboard/profile")).status,
    401,
  );
  assert.equal(
    (await worker.fetch("/api/export?list=credits", { headers: alice })).status,
    403,
  );
  const judge = {
    "oai-authenticated-user-id": "fake_judge",
    "oai-authenticated-user-email": "judge@portal.test",
  };
  assert.equal(
    (await worker.fetch("/dashboard/credits", { headers: judge })).status,
    403,
  );
  const owner = {
    "oai-authenticated-user-id": "synthetic-owner",
    "oai-authenticated-user-email": "connectwithparam.30@gmail.com",
  };
  assert.equal(
    (await worker.fetch("/admin/permissions", { headers: owner })).status,
    200,
  );
  const mutation = await worker.fetch(
    `http://${worker.address}:${worker.port}/api/portal`,
    {
      method: "POST",
      headers: {
        ...owner,
        "content-type": "application/json",
        origin: `http://${worker.address}:${worker.port}`,
      },
      body: JSON.stringify({
        action: "local-signin",
        data: { fixture: "owner" },
      }),
    },
  );
  assert.equal(mutation.status, 404);
  assert.equal(mutation.headers.get("set-cookie"), null);
  const creditImport = await worker.fetch(
    `http://${worker.address}:${worker.port}/api/portal`,
    {
      method: "POST",
      headers: {
        ...owner,
        "content-type": "application/json",
        origin: `http://${worker.address}:${worker.port}`,
      },
      body: JSON.stringify({
        action: "preview-import",
        data: {
          kind: "credits",
          csv: "value\nSYNTHETIC-ONLY",
          typeId: "unused",
        },
      }),
    },
  );
  assert.equal(creditImport.status, 422);
  assert.equal((await creditImport.json()).code, "CREDIT_TYPE_REQUIRED");
  assert.equal((await worker.fetch("/api/portal?view=/rules")).status, 401);
  const nestedBraces = "{".repeat(256) + "literal text" + "}".repeat(256);
  const profileMutation = await worker.fetch(
    `http://${worker.address}:${worker.port}/api/portal`,
    {
      method: "POST",
      headers: {
        ...alice,
        "content-type": "application/json",
        origin: `http://${worker.address}:${worker.port}`,
      },
      body: JSON.stringify({ action: "profile", data: { bio: nestedBraces } }),
    },
  );
  assert.equal(profileMutation.status, 200);
  const storedProfile = await worker.fetch(
    "/api/portal?view=/dashboard/profile",
    { headers: alice },
  );
  assert.equal((await storedProfile.json()).profile.bio, nestedBraces);
  const literalLookup = await worker.fetch(
    "/api/portal?view=" + encodeURIComponent("/teams/" + nestedBraces),
    { headers: alice },
  );
  assert.equal(literalLookup.status, 404);
  assert.equal((await worker.fetch("/")).status, 200);
  report.syntheticDispatch = {
    realChatGPTSignInVerified: false,
    creditEncryptionKeyConfigured: false,
    eventSettingsConfigured: false,
    invalidCreditPoolWithoutKey: 422,
    anonymousPrivatePage: 302,
    participantProfilePage: 200,
    participantDashboardBeforeEventInitialization: 200,
    participantPrivateAPI: 200,
    anonymousPrivateAPI: 401,
    participantAdminPage: 403,
    participantExport: 403,
    judgeCreditsPage: 403,
    verifiedHarnessOwnerAdminPage: 200,
    localSignInCommand: 404,
    signedInRulesAnonymousAPI: 401,
    nestedBraceProfileRoundTrip: true,
    nestedBraceTeamLookup: 404,
  };
  const post = async (identity, action, data) => {
    const base = `http://${worker.address}:${worker.port}`;
    return worker.fetch(base + "/api/portal", {
      method: "POST",
      headers: {
        ...identity,
        "content-type": "application/json",
        origin: base,
      },
      body: JSON.stringify({ action, data }),
    });
  };
  const voucher = "SYNTHETIC-COMPILED-VOUCHER-ONLY";
  const voucherType = await post(owner, "credit-type", {
    name: "Synthetic keyless voucher",
    instructions: "Synthetic redemption instructions.",
  });
  assert.equal(voucherType.status, 200);
  const voucherTypeId = (await voucherType.json()).id;
  const voucherPreview = await post(owner, "preview-import", {
    kind: "credits",
    typeId: voucherTypeId,
    csv: "value\n" + voucher,
  });
  assert.equal(voucherPreview.status, 200);
  const voucherDigest = (await voucherPreview.json()).digest;
  assert.equal(
    (
      await post(owner, "commit-import", {
        kind: "credits",
        typeId: voucherTypeId,
        csv: "value\n" + voucher,
        digest: voucherDigest,
      })
    ).status,
    200,
  );
  const frank = {
    "oai-authenticated-user-id": "fake_frank",
    "oai-authenticated-user-email": "frank@portal.test",
  };
  assert.equal(
    (
      await post(owner, "admin-status", {
        kind: "person",
        targetId: "fake_frank",
        status: "Checked in",
        confirmation: "CHANGE_STATUS",
      })
    ).status,
    200,
  );
  assert.equal(
    (await post(owner, "allocate", { userId: "fake_frank" })).status,
    200,
  );
  const voucherReveal = await post(frank, "reveal-credit", {
    typeId: voucherTypeId,
  });
  assert.equal(voucherReveal.status, 200);
  assert.match(voucherReveal.headers.get("cache-control"), /no-store/);
  assert.equal((await voucherReveal.json()).value, voucher);
  const ordinaryCredits = await worker.fetch("/api/export?list=credits", {
    headers: owner,
  });
  assert.equal(ordinaryCredits.status, 200);
  assert.equal((await ordinaryCredits.text()).includes(voucher), false);
  report.syntheticDispatch.voucherImportAndRevealWithoutKey = 200;
  const pending = {
    "oai-authenticated-user-id": "fake_pending",
    "oai-authenticated-user-email": "pending@portal.test",
  };
  const created = await post(pending, "create-workspace-team", {
    name: "Synthetic Worker Geometry",
    avatar: "initials",
    palette: "cobalt",
  });
  assert.equal(created.status, 200, await created.text());
  const pendingWorkspace = await worker.fetch("/api/portal?view=/dashboard", {
    headers: pending,
  });
  const pendingData = await pendingWorkspace.json();
  assert.equal(pendingData.team.palette, "cobalt");
  assert.equal(pendingData.teamReadiness.allApproved, false);
  assert.equal(pendingData.status, "Registered");
  const missingGender = await post(pending, "complete-profile", {
    displayName: "Synthetic Builder",
    bio: "A synthetic builder profile.",
    skills: "TypeScript",
  });
  assert.equal(missingGender.status, 422);
  const draft = await post(pending, "save-project", {
    revision: 0,
    project: {
      projectName: "Synthetic Worker Draft",
      problemSolution: "A test project",
      description: "Local compiled Worker test",
      github: "https://github.com/example/test",
      demo: "",
      logo: syntheticImage(64, 64),
      banner: syntheticImage(160, 90),
      tools: "Codex CLI",
      contributions: [],
      attestation: false,
    },
  });
  assert.equal(draft.status, 403, await draft.text());
  assert.equal((await worker.fetch("/api/portal?view=/teams")).status, 401);
  const privateMarker = "COMPILED-SYNTHETIC-PRIVATE-ARRIVAL";
  const venueDraft = await post(owner, "content-save", {
    scope: "private",
    revision: 0,
    content: {
      location: privateMarker,
      directions: "Synthetic instructions",
      mapUrl: "",
    },
    reason: "Synthetic venue setup",
  });
  assert.equal(venueDraft.status, 200, await venueDraft.text());
  assert.equal(
    (
      await post(owner, "content-publish", {
        scope: "private",
        revision: 1,
        reason: "Synthetic private publication",
      })
    ).status,
    200,
  );
  const goingView = await worker.fetch("/api/portal?view=/dashboard", {
    headers: alice,
  });
  assert.equal((await goingView.json()).privateVenue.location, privateMarker);
  const publicView = await worker.fetch("/api/portal?view=/");
  assert.ok(!(await publicView.text()).includes(privateMarker));
  const withdrawn = await post(owner, "participant-bulk", {
    emails: ["alice@portal.test"],
    status: "pending",
    reason: "Synthetic approval withdrawal",
  });
  assert.equal(withdrawn.status, 200);
  const revokedView = await worker.fetch("/api/portal?view=/dashboard", {
    headers: alice,
  });
  assert.equal((await revokedView.json()).privateVenue, undefined);
  const board = await worker.fetch("/api/portal?view=/leaderboard");
  const boardText = await board.text();
  assert.equal(board.status, 200);
  assert.ok(!/evaluationState|rating|privateVenue/.test(boardText));
  const publicPolicy = await (await worker.fetch("/api/portal?view=/")).json();
  assert.equal(publicPolicy.submissionClose, null);
  const repeated = await worker.fetch("/api/portal?view=/dashboard", {
    headers: alice,
  });
  assert.equal(repeated.status, 200);
  assert.equal(repeated.headers.get("set-cookie"), null);
  const anonymousAgain = await worker.fetch("/api/portal?view=/dashboard");
  assert.equal(anonymousAgain.status, 401);
  const revealWithoutIntent = await post(owner, "reveal-ai-scores", {
    reason: "Synthetic missing confirmation",
    confirmation: "",
  });
  assert.equal(revealWithoutIntent.status, 422);
  const ownerPreview = await post(owner, "preview-submission-extension", {
    version: 0,
    minutes: 30,
  });
  assert.equal(ownerPreview.status, 422);
  const participantPreview = await post(alice, "preview-policy-weights", {
    version: 0,
    weights: {
      human: 50,
      ai: 30,
      votes: 5,
      diversity: 10,
      codex: 5,
      feedback: 5,
    },
  });
  assert.equal(participantPreview.status, 403);
  report.stagedRelease = {
    missingSettingsHaveNoInventedDeadline: publicPolicy.submissionClose === null,
    repeatedManagedIdentity: 200,
    anonymousAfterIdentityRemoved: 401,
    appSessionCookieIssued: false,
    revealWithoutExplicitIntent: 422,
    extensionWithoutConfiguredDeadline: 422,
    participantGlobalPolicyPreview: 403,
    realManagedLogoutVerified: false,
  };
  // Only this disposable local D1 harness receives the following synthetic operational setup.
  const syntheticNow = Date.now();
  const windowRequest = {
    open: new Date(syntheticNow - 3600000).toISOString(),
    close: new Date(syntheticNow + 3600000).toISOString(),
  };
  const windowPreview = await post(
    owner,
    "preview-submission-window",
    windowRequest,
  );
  assert.equal(windowPreview.status, 200);
  const proposedWindow = await windowPreview.json();
  const publishedWindow = await post(owner, "publish-submission-window", {
    ...windowRequest,
    token: proposedWindow.token,
    version: proposedWindow.version,
    reason: "Synthetic real-window preview workflow",
    confirmation: "CHANGE_SUBMISSION_WINDOW",
  });
  assert.equal(publishedWindow.status, 200, await publishedWindow.text());
  const setup = await (
    await worker.fetch("/api/portal?view=/admin/settings", { headers: owner })
  ).json();
  assert.equal(setup.readiness.submissions.configured, true);
  assert.equal(setup.readiness.submissions.enabled, true);
  assert.equal(setup.readiness.submissions.allowed, true);
  assert.equal(setup.readiness.checkin.enabled, true);
  assert.equal(setup.readiness.scoring.ready, false);
  const participantWindow = await post(alice, "preview-submission-window", windowRequest);
  assert.equal(participantWindow.status, 403);
  report.derivedOperationalPrerequisites = {
    actualWindowPublication: 200,
    submissionAllowedWithoutManualActivation: true,
    checkinAllowedWithoutManualActivation: true,
    scoringStillRequiresActualConfiguration: true,
    participantWindowChangeDenied: 403,
    realChatGPTBrowserSession: false,
  };
  await post(owner, "participant-bulk", {
    emails: ["alice@portal.test"],
    status: "approved",
    reason: "Synthetic approval restore",
  });
  const attendance = await post(owner, "admin-status", {
    kind: "person",
    targetId: "fake_alice",
    status: "Checked in",
    reason: "Synthetic disposable physical attendance",
    confirmation: "CHANGE_STATUS",
  });
  assert.equal(attendance.status, 200, await attendance.text());
  const committed = await post(alice, "submit-project", {
    revision: 0,
    project: {
      projectName: "Synthetic Operational Worker",
      problemSolution: "Verify submission without judging policy",
      description: "Synthetic reproducible instructions",
      github: "https://github.com/example/rehearsal",
      commitSha: "a".repeat(40),
      demo: "",
      logo: syntheticImage(64, 64),
      banner: syntheticImage(160, 90),
      tools: "Codex CLI",
      contributions: [
        {
          userId: "fake_alice",
          role: "Built this synthetic test",
          codex: "Verified the Worker flow",
        },
      ],
      attestation: true,
    },
  });
  assert.equal(committed.status, 200, await committed.text());
  assert.equal((await post(owner, "compute-results", {})).status, 409);
  const repeatedCheckin = await post(owner, "participant-bulk", {
    emails: ["alice@portal.test"],
    checkIn: true,
    reason: "Synthetic idempotent attendance without readiness checkboxes",
  });
  assert.equal(repeatedCheckin.status, 200, await repeatedCheckin.text());
  const rejectedPhoto = await post(alice, "complete-profile", {
    displayName: "Synthetic Alice",
    gender: "non-binary",
    bio: "Synthetic builder",
    photo: syntheticImage(64, 64),
  });
  assert.equal(rejectedPhoto.status, 422);
  assert.equal(
    (await worker.fetch("/api/profile-photo/fake_alice", { headers: alice }))
      .status,
    404,
  );
  const robots = await worker.fetch("/robots.txt");
  assert.equal(robots.status, 200);
  assert.match(await robots.text(), /Disallow: \/admin/);
  const sitemap = await worker.fetch("/sitemap.xml");
  assert.equal(sitemap.status, 200);
  const xml = await sitemap.text();
  assert.match(
    xml,
    /https:\/\/dddhack-portal\.param3021\.chatgpt\.site\/projects/,
  );
  assert.ok(!xml.includes("fake_alice") && !xml.includes("/admin"));
  const publicSSR = await worker.fetch("/projects");
  assert.equal(publicSSR.status, 200);
  const projectHTML = await publicSSR.text();
  assert.match(projectHTML, /<h1[^>]*>Projects/);
  assert.match(projectHTML, /rel="canonical"/);
  const homeSEO = await worker.fetch("/");
  const homeSEOHTML = await homeSEO.text();
  assert.match(homeSEOHTML, /application\/ld\+json/);
  assert.ok(!homeSEOHTML.includes(privateMarker));
  const unmatched = await worker.fetch("/api/portal?view=/profile", {
    headers: {
      "oai-authenticated-user-id": "fake_stranger",
      "oai-authenticated-user-email": "stranger@portal.test",
    },
  });
  assert.equal(unmatched.status, 403);
  assert.equal(
    (await unmatched.json()).message,
    "Please sign in with your Luma-registered email",
  );
  const mismatchShell = await worker.fetch("/dashboard", {
    headers: {
      "oai-authenticated-user-id": "fake_stranger",
      "oai-authenticated-user-email": "stranger@portal.test",
    },
  });
  assert.equal(mismatchShell.status, 200);
  assert.match(mismatchShell.headers.get("content-type") || "", /text\/html/);
  const mismatchHTML = await mismatchShell.text();
  assert.match(mismatchHTML, /Codex Community New Delhi/);
  assert.ok(!mismatchHTML.includes(privateMarker));
  assert.match(mismatchShell.headers.get("cache-control") || "", /no-store/);
  report.rosterGate = {
    unmatchedVerifiedEmail: 403,
    unmatchedEmailRecoveryShell: 200,
    ownerBootstrap: 200,
    realParticipantImport: false,
  };
  report.photoAndSEO = {
    canonicalPublicSSR: 200,
    robots: 200,
    sitemap: 200,
    participantPhotoUpload: 422,
    participantPhotoRoute: 404,
    photoUploadsDisabled: true,
    privateDataAbsent: true,
    browserVisualQA: false,
  };
  report.operationalReadiness = {
    environment: "disposable local synthetic D1 only",
    operationalSubmissionWithJudgingIncomplete: 200,
    scoringStillBlocked: 409,
    checkinWithoutManualEnablement: 200,
    repeatedAttendanceIsSafe: true,
    actualScoringConfigurationStillRequired: true,
  };
  report.revisedExperience = {
    registeredTeamCreation: 200,
    sharedTeamAccent: true,
    allMembersApproved: false,
    missingRequiredGender: 422,
    projectDraftSave: 403,
    privateTeamsAnonymousAPI: 401,
    allApprovedVenueVisible: true,
    publicVenueSecretAbsent: true,
    approvalRevocationRemovesVenue: true,
    leaderboardExcludesInternalEvaluation: true,
    realChatGPTSignInVerified: false,
  };
  writeFileSync(
    "evidence/sites-production-smoke.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (worker) await worker.stop();
  rmSync(persistTo, { recursive: true, force: true });
}
