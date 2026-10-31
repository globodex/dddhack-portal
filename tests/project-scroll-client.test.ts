import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Projects } from "../app/portal";
import { appendUniqueItems } from "../app/use-incremental-pages";
import {
  projectPageUrl,
  projectFeedPage,
  readProjectPage,
  readProjectVote,
} from "../app/use-project-feed";
import {
  requiresActionConfirmation,
  revealConfirmation,
} from "../lib/action-confirmation";

test("public engagement skips the dialog without changing protected confirmation actions", () => {
  assert.equal(requiresActionConfirmation("upvote-project"), false);
  assert.equal(revealConfirmation("upvote-project", {}), undefined);
  assert.equal(requiresActionConfirmation("comment-project"), false);
  assert.equal(revealConfirmation("comment-project", {}), undefined);
  for (const action of [
    "submit-project",
    "lock-team",
    "delete-credit-column",
    "bulk-check-in",
    "reveal-final-scores",
  ])
    assert.equal(requiresActionConfirmation(action), true);
});

test("showcase exposes accessible incremental loading while leaderboard keeps its page controls", () => {
  const props = {
    run: async () => ({}),
    data: {
      items: [
        {
          id: "p",
          slug: "saved-slug",
          projectName: "Saved project",
          teamName: "Saved team",
          problemSolution: "Saved summary",
          upvotes: 2,
          comments: 0,
        },
      ],
      page: 0,
      hasMore: true,
    },
  };
  const showcase = renderToStaticMarkup(
    createElement(Projects, { ...props, path: "/projects" }),
  );
  assert.match(showcase, /project-scroll-pagination/);
  assert.match(showcase, />Load more<\/button>/);
  assert.doesNotMatch(showcase, /Previous page|Next page|Page 1/);
  const board = renderToStaticMarkup(
    createElement(Projects, { ...props, path: "/leaderboard" }),
  );
  assert.match(board, /Previous page/);
  assert.match(board, /Next page/);
  assert.doesNotMatch(board, /project-scroll-pagination/);
  const done = renderToStaticMarkup(
    createElement(Projects, {
      ...props,
      data: { ...props.data, hasMore: false },
      path: "/projects",
    }),
  );
  assert.doesNotMatch(done, />Load more<|All projects loaded/);
});

test("page adapter preserves focused seed position and overlapping pages do not duplicate or discard unique cards", () => {
  assert.equal(projectFeedPage({ page: 3, hasMore: true }).nextCursor, "4");
  assert.equal(projectFeedPage({ page: 4, hasMore: false }).nextCursor, null);
  const before = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(
    appendUniqueItems(before, [
      { id: "b" },
      { id: "c" },
      { id: "c" },
      { id: "d" },
    ]),
    [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
  );
  assert.deepEqual(before, [{ id: "a" }, { id: "b" }]);
});

test("project reads encode search separately, stay private and reject invalid or unbounded pages", async () => {
  const original = globalThis.fetch,
    signal = new AbortController().signal;
  const url = projectPageUrl("  team & #one?  ", "2");
  const params = new URL(url, "https://portal.test").searchParams;
  assert.equal(params.get("view"), "/projects");
  assert.equal(params.get("q"), "team & #one?");
  assert.equal(params.get("page"), "2");
  assert.throws(() => projectPageUrl("", "NaN"));
  assert.throws(() => projectPageUrl("", "-1"));
  globalThis.fetch = async (input, init) => {
    assert.equal(input, url);
    assert.ok(init?.signal instanceof AbortSignal);
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.credentials, "same-origin");
    return Response.json({ items: [{ id: "x" }], page: 2, hasMore: true });
  };
  try {
    assert.equal((await readProjectPage(url, signal)).nextCursor, "3");
    globalThis.fetch = async () =>
      Response.json({ code: "BACKEND_UNAVAILABLE" }, { status: 503 });
    await assert.rejects(
      readProjectPage(url, signal),
      /Projects could not be loaded. Try again/,
    );
    for (const page of [
      { items: [], page: 1 },
      {
        items: Array.from({ length: 25 }, (_, n) => ({ id: String(n) })),
        page: 2,
      },
      { items: [{}], page: 2 },
    ]) {
      globalThis.fetch = async () => Response.json(page);
      await assert.rejects(
        readProjectPage(url, signal),
        /Projects could not be loaded/,
      );
    }
    globalThis.fetch = async () => {
      throw new DOMException("Canceled", "AbortError");
    };
    await assert.rejects(readProjectPage(url, signal), { name: "AbortError" });
  } finally {
    globalThis.fetch = original;
  }
});

test("vote reconciliation uses the exact existing public project and rejects a misleading count", async () => {
  const original = globalThis.fetch,
    signal = new AbortController().signal;
  globalThis.fetch = async (input, init) => {
    assert.equal(
      new URL(String(input), "https://portal.test").searchParams.get("view"),
      "/projects/saved%26slug",
    );
    assert.ok(init?.signal instanceof AbortSignal);
    assert.equal(init?.credentials, "same-origin");
    return Response.json({
      items: [{ id: "p", upvotes: 5, upvoted: true, canUpvote: true }],
    });
  };
  try {
    assert.deepEqual(await readProjectVote("p", "saved&slug", signal), {
      upvotes: 5,
      upvoted: true,
      canUpvote: true,
    });
    globalThis.fetch = async () =>
      Response.json({
        items: [{ id: "another", upvotes: 5, upvoted: true, canUpvote: true }],
      });
    await assert.rejects(
      readProjectVote("p", "saved&slug", signal),
      /count could not be refreshed/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
