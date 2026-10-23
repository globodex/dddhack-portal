import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Discover } from "../app/portal";
import { peopleDirectoryUrl, readPeoplePage } from "../app/use-discover-people";

const run = async () => ({});
test("participant cards retain safe dialog controls and accessible pagination without exposing private input fields", () => {
  const markup = renderToStaticMarkup(createElement(Discover, {
    path: "/discover/participants",
    run,
    data: { items: [{ id: "fake_first", name: "Synthetic Person", bio: "Public bio", phone: "PRIVATE-PHONE", idea: "PRIVATE-IDEA", email: "PRIVATE-EMAIL", credit: "PRIVATE-CREDIT" }], hasMore: true, nextCursor: "next" },
  }));
  assert.match(markup, /discover-people-cards/);
  assert.match(markup, /aria-label="People" aria-busy="false"/);
  assert.match(markup, /id="person-fake_first"/);
  assert.match(markup, /aria-label="View Synthetic Person&#x27;s profile" aria-haspopup="dialog"/);
  assert.match(markup, /<button type="button">Load more<\/button>/);
  assert.doesNotMatch(markup, /PRIVATE-|All people loaded/);
  const finished = renderToStaticMarkup(createElement(Discover, { path: "/discover/participants", run, data: { items: [{ id: "fake_last", name: "Last" }], hasMore: false, nextCursor: null } }));
  assert.match(finished, /All people loaded/);
  assert.doesNotMatch(finished, />Load more</);
});

test("directory fetch keeps full search, membership, cursor and focus in distinct encoded parameters", async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  const params = { search: "  End & beyond? #private  ", membership: "out", cursor: "opaque&cursor?", person: "fake_focus" };
  const url = peopleDirectoryUrl(params);
  const parsed = new URL(url, "https://portal.test");
  assert.equal(parsed.pathname, "/api/portal");
  assert.equal(parsed.searchParams.get("view"), "/discover/participants");
  assert.equal(parsed.searchParams.get("q"), params.search.trim());
  assert.equal(parsed.searchParams.get("membership"), "out");
  assert.equal(parsed.searchParams.get("cursor"), params.cursor);
  assert.equal(parsed.searchParams.get("person"), params.person);
  assert.equal(parsed.searchParams.get("limit"), "24");
  assert.equal(parsed.hash, "");
  globalThis.fetch = async (input, init) => {
    assert.equal(input, url);
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.credentials, "same-origin");
    assert.equal(init?.signal, controller.signal);
    return Response.json({ items: [{ id: "fake_focus" }], hasMore: false, nextCursor: null });
  };
  try {
    assert.deepEqual(await readPeoplePage(url, controller.signal), { items: [{ id: "fake_focus" }], hasMore: false, nextCursor: null });
    globalThis.fetch = async () => Response.json({ message: "Synthetic directory unavailable." }, { status: 503 });
    await assert.rejects(readPeoplePage(url, controller.signal), /Synthetic directory unavailable/);
    globalThis.fetch = async () => { throw new DOMException("Canceled", "AbortError"); };
    await assert.rejects(readPeoplePage(url, controller.signal), { name: "AbortError" });
  } finally { globalThis.fetch = original; }
});
