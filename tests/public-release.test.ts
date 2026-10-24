import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { setup, activate, attend } from "./helpers";
import { syntheticImage } from "./fixture-images";
import Portal from "../app/portal";
import { delhiOffset } from "../lib/delhi-motion";
import { eventTitle, pageMetadata, safeJSONLD, siteOrigin } from "../lib/seo";
import { publicSitemap } from "../lib/sitemap";
import { GET as robots } from "../app/robots.txt/route";
import { PortalService } from "../lib/service";

test("approved Delhi pack matches original or independently verified lossless encoding; inverse fill offsets clamp and scale", () => {
  const hashes: Record<string, string> = {
    "delhi-fill-overscan.png":
      "17f8e31b0803566388bedca68f8471307a64205b4556cac8c2a757a29f640d0b",
    "fallback-approved-v3.png":
      "18d26b3d5cd123b624f1d005458cfcb536476f34ba91fa2c80263a858069dfb0",
    "metro-static.png":
      "f52185c3282c5df1f18909c0407f624910b43469575b187324adaa675d043110",
    "text-mask-alpha.png":
      "4cb67a233957b75b3a4323c54e51bf84cbbace0b823367a69ebce0f85279caf0",
  };
  for (const [name, hash] of Object.entries(hashes)) {
    const bytes = readFileSync("public/art/delhi-v3/" + name);
    // Both exact encodings were independently checked against the approved
    // pixel/alpha/metadata baseline; arbitrary replacement artwork is rejected.
    const lossless: Record<string, string> = {
      "delhi-fill-overscan.png":
        "325d353c1e874aeb98864741c9bf0e0fa6fb1f3e8657431cba02609576041f33",
      "fallback-approved-v3.png":
        "bec57daa23b34ee1786e7d3d7fd68939ff943756a11cb4b589c21aab1e5235eb",
      "metro-static.png":
        "b8de85137167a70568eeff715f5880fdebf6ce0998b7cdc8848016199016534c",
      "text-mask-alpha.png":
        "edc05d2a1af15111da7fe54934b40cb7513550016c066d41a3f97d4c98b76ecb",
    };
    assert.ok(
      [hash, lossless[name]].includes(
        createHash("sha256").update(bytes).digest("hex"),
      ),
      name,
    );
    assert.equal(
      bytes.readUInt32BE(16),
      name.includes("overscan") ? 2112 : 2048,
    );
    assert.equal(bytes.readUInt32BE(20), name.includes("overscan") ? 832 : 768);
  }
  assert.deepEqual(delhiOffset(0, 0, 1024, 384), { x: 3, y: 2 });
  assert.deepEqual(delhiOffset(2048, 768, 1024, 384), { x: -3, y: -2 });
  assert.deepEqual(delhiOffset(100, 100, 0, 0), { x: 0, y: 0 });
  assert.deepEqual(delhiOffset(0, 0, 1024, 384, false), { x: 0, y: 0 });
});

test("public SSR renders the approved shell and public project content before hydration", () => {
  const home = renderToStaticMarkup(createElement(Portal, { path: "/" }));
  assert.ok(home.includes("public-home-shell"));
  assert.ok(home.includes("/brand/codex-user-supplied.svg"));
  assert.ok(home.includes("Codex Community New Delhi"));
  assert.ok(home.includes(eventTitle));
  assert.ok(home.includes('aria-label="Scroll to schedule"'));
  assert.ok(home.indexOf('id="schedule"') < home.indexOf('id="venue"'));
  assert.ok(home.indexOf('id="venue"') < home.indexOf('id="rules"'));
  assert.ok(home.indexOf('id="rules"') < home.indexOf('id="faq"'));
  assert.ok(
    home.indexOf('id="faq"') < home.indexOf("Meet the Organizers behind"),
  );
  const html = renderToStaticMarkup(
    createElement(Portal, {
      path: "/projects",
      initialPublic: {
        items: [
          {
            id: "public-1",
            slug: "public-1",
            projectName: "Published SSR project",
            problemSolution: "Public description",
            teamName: "Public team",
            upvotes: 0,
            comments: 0,
          },
        ],
        page: 0,
      },
    }),
  );
  assert.ok(html.includes("Published SSR project"));
  assert.ok(!html.includes("Loading…"));
  for (const path of [
    "/dashboard",
    "/admin/settings",
    "/profile",
    "/discover/participants",
    "/teams",
    "/unknown",
  ]) {
    const metadata = pageMetadata(path);
    assert.equal(metadata.robots.index, false, path);
    assert.equal("openGraph" in metadata, false, path);
  }
  assert.ok(!safeJSONLD({ value: "</script><script>" }).includes("<"));
});

test("sitemap and metadata reuse anonymous eligible published projections and exclude drafts and private content", async () => {
  const { db } = await setup();
  try {
    await activate(db);
    await attend(db, "fake_alice", "fake_bob");
    const time = "2026-11-01T04:00:00.000Z";
    const payload = JSON.stringify({
      projectName: "Published public project",
      problemSolution: "Public description",
      description: "Public long description",
      github: "https://github.com/example/public",
      logo: syntheticImage(64, 64),
      banner: syntheticImage(160, 90),
    });
    await db.batch([
      db
        .prepare(
          "INSERT INTO submission_versions VALUES('seo-v1','fake_team1',1,?,?)",
        )
        .bind(payload, time),
      db
        .prepare(
          "INSERT INTO projects VALUES('seo-public','fake_team1','seo-public',?,1,'seo-v1',?)",
        )
        .bind(JSON.stringify({ projectName: "PRIVATE-DRAFT-MARKER" }), time),
      db
        .prepare(
          "INSERT INTO project_eligibility VALUES('seo-public','seo-v1','eligible','PRIVATE-REASON-MARKER','fake_admin',?)",
        )
        .bind(time),
      db
        .prepare(
          "INSERT INTO projects VALUES('seo-draft','fake_team3','PRIVATE-DRAFT-SLUG','{}',1,NULL,?)",
        )
        .bind(time),
      db
        .prepare("INSERT INTO private_venue VALUES(1,?,?,1,?)")
        .bind(
          JSON.stringify({ location: "PRIVATE-VENUE-MARKER" }),
          JSON.stringify({ location: "PRIVATE-VENUE-MARKER" }),
          time,
        ),
    ]);
    const sitemap = () =>
      publicSitemap((page) =>
        new PortalService(db, null, undefined).view("/projects", { page }),
      );
    const response = await sitemap();
    assert.equal(response.status, 200);
    const xml = await response.text();
    assert.ok(xml.includes(siteOrigin + "/projects/seo-public"));
    assert.ok(!xml.includes("PRIVATE-"));
    assert.ok(!xml.includes("fake_alice"));
    const publicView = await new PortalService(db, null, undefined).view(
      "/projects/seo-public",
    );
    const metadata = pageMetadata(
      "/projects/seo-public",
      (publicView.items as Record<string, any>[])[0],
    );
    assert.ok(metadata.title.startsWith("Published public project"));
    assert.equal(metadata.robots.index, true);
    assert.ok(!JSON.stringify(metadata).includes("PRIVATE-"));
    await assert.rejects(
      new PortalService(db, null, undefined).view(
        "/projects/PRIVATE-DRAFT-SLUG",
      ),
    );
    await db
      .prepare(
        "UPDATE project_eligibility SET status='ineligible' WHERE project_id='seo-public'",
      )
      .all();
    const removed = await sitemap();
    assert.ok(!(await removed.text()).includes("seo-public"));
    const crawlerRules = await (await robots()).text();
    // Crawlers must be able to read noindex on HTML; auth still protects data.
    assert.ok(!crawlerRules.includes("Disallow: /admin"));
    assert.ok(crawlerRules.includes("Disallow: /api"));
    assert.ok(crawlerRules.includes("Sitemap: " + siteOrigin + "/sitemap.xml"));
  } finally {
    db.close();
  }
});
