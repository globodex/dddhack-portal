import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ProjectShare, { ProjectShareDialog } from "../app/project-share";
import ProjectSubmissionSuccess from "../app/project-submission-success";
import {
  projectShareCaption,
  projectShareHashtags,
  projectShareIntents,
  projectShareText,
  projectShareUrl,
  submittedProjectSuccess,
} from "../lib/project-share";

test("share URLs use only explicit valid public paths and actual origin", () => {
  assert.equal(
    projectShareUrl("/projects/small-wonder", "https://community.example"),
    "https://community.example/projects/small-wonder",
  );
  assert.equal(
    projectShareUrl("/projects/small-wonder", "http://localhost:3016"),
    "http://localhost:3016/projects/small-wonder",
  );
  for (const path of [
    undefined,
    "",
    "//evil.example/projects/x",
    "/projects/x?private=1",
    "/projects/x#secret",
    "/projects/a%2fb",
    "/dashboard",
    "https://evil.example/projects/x",
    "/projects/../admin",
    "/projects/",
  ])
    assert.equal(projectShareUrl(path, "https://community.example"), null);
  for (const origin of [
    "http://public.example",
    "javascript:alert(1)",
    "https://name:password@community.example",
    "https://community.example/private",
    "https://community.example?x=1",
  ])
    assert.equal(projectShareUrl("/projects/small-wonder", origin), null);
});

test("exact post text and one X service use supported encoded intent fields", () => {
  const url = "https://community.example/projects/small-wonder";
  assert.equal(
    projectShareCaption,
    "Check out this hackathon project, built at DevDay Exchange Community Hackathon New Delhi",
  );
  assert.deepEqual(projectShareHashtags, [
    "DevDayCommunity",
    "DevDayCommunityDelhi",
  ]);
  assert.equal(
    projectShareText(url),
    `${projectShareCaption}\n\n#DevDayCommunity #DevDayCommunityDelhi\n${url}`,
  );
  const intents = projectShareIntents(url);
  assert.equal(intents.length, 3);
  const x = new URL(intents[0].href);
  assert.equal(x.origin + x.pathname, "https://x.com/intent/tweet");
  assert.equal(x.searchParams.get("text"), projectShareCaption);
  assert.equal(
    x.searchParams.get("hashtags"),
    "DevDayCommunity,DevDayCommunityDelhi",
  );
  assert.equal(x.searchParams.get("url"), url);
  assert.deepEqual([...new URL(intents[1].href).searchParams], [["u", url]]);
  assert.deepEqual([...new URL(intents[2].href).searchParams], [["url", url]]);
  assert.equal(
    renderToStaticMarkup(
      createElement(ProjectShare, { publicPath: "/dashboard" }),
    ),
    "",
  );
  assert.match(
    renderToStaticMarkup(
      createElement(ProjectShare, { publicPath: "/projects/small-wonder" }),
    ),
    /aria-label="Share"/,
  );
});

test("success requires a real committed receipt, exact count, and fresh server granted public path", () => {
  const result = { versionId: "committed-version", attemptsUsed: 1 };
  const fresh = {
    submissionAccess: { attemptsUsed: 1 },
    projectPublicPath: "/projects/small-wonder",
    project: {
      slug: "DRAFT-SECRET",
      published_version_id: "committed-version",
    },
  };
  assert.deepEqual(submittedProjectSuccess(result, fresh), {
    attempt: 1,
    publicPath: "/projects/small-wonder",
  });
  assert.deepEqual(submittedProjectSuccess(result), {
    attempt: 1,
    publicPath: null,
  });
  assert.deepEqual(
    submittedProjectSuccess(result, {
      ...fresh,
      submissionAccess: { attemptsUsed: 3 },
      project: { published_version_id: "newer-committed-version" },
    }),
    {
      attempt: 1,
      publicPath: null,
    },
    "An idempotent receipt keeps its own committed attempt instead of a newer workspace count",
  );
  assert.deepEqual(
    submittedProjectSuccess(result, { ...fresh, projectPublicPath: null }),
    { attempt: 1, publicPath: null },
  );
  assert.equal(submittedProjectSuccess({}, fresh), null);
  assert.equal(
    submittedProjectSuccess({ versionId: "x", attemptsUsed: 4 }),
    null,
  );
  for (const attempt of [1, 2, 3]) {
    const html = renderToStaticMarkup(
      createElement(ProjectSubmissionSuccess, {
        value: { attempt, publicPath: null },
        onClose() {},
      }),
    );
    assert.match(html, /role="status"/);
    assert.match(html, /Project submitted successfully/);
    assert.match(html, new RegExp(`Submission ${attempt} of 3`));
    assert.doesNotMatch(html, /<dialog|>Done<\/button>/);
    assert.doesNotMatch(
      html,
      /View project|aria-label="Share"|evaluation|pending|\/projects\//i,
    );
  }
});

test("share modal keeps Copy Link and platform-native prefill without a separate copy-post-text button", () => {
  const url =
    "https://community.example/projects/demo?source=a&note=two%20words#details";
  const html = renderToStaticMarkup(
    createElement(ProjectShareDialog, {
      url,
      projectName: "Synthetic share project",
      onClose() {},
    }),
  );
  assert.doesNotMatch(
    html,
    /project-share-caption-copy|>\s*Copy post text\s*</,
  );
  assert.match(html, /Project link/);
  assert.match(html, />\s*Copy\s*</);
  for (const intent of projectShareIntents(url)) {
    const parsed = new URL(intent.href);
    assert.equal(parsed.protocol, "https:");
    assert.equal(
      parsed.searchParams.get(intent.id === "facebook" ? "u" : "url"),
      url,
    );
    if (intent.id === "x") {
      assert.equal(parsed.searchParams.get("text"), projectShareCaption);
      assert.equal(
        parsed.searchParams.get("hashtags"),
        projectShareHashtags.join(","),
      );
    } else
      assert.equal(
        parsed.searchParams.has("text"),
        false,
        "Do not invent unsupported caption parameters",
      );
  }
  assert.doesNotMatch(html, /instagram.com\/.*(?:share|intent)/);
});
