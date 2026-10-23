import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Projects } from "../app/portal";

test("public project comments render the event timezone identically under different server and browser defaults", () => {
  const original = process.env.TZ;
  const data = {
    items: [
      {
        id: "synthetic",
        slug: "synthetic",
        projectName: "Synthetic",
        banner: "/synthetic.png",
        logo: "/logo.png",
        upvotes: 0,
        comments: 1,
      },
    ],
    comments: [
      {
        id: "comment",
        author: "Synthetic",
        body: "A local test",
        created_at: "2026-10-23T18:30:26.000Z",
      },
    ],
  };
  try {
    const render = (timezone: string) => {
      process.env.TZ = timezone;
      return renderToStaticMarkup(
        createElement(Projects, {
          data,
          path: "/projects/synthetic",
          run: async () => ({}),
        }),
      );
    };
    const server = render("UTC");
    assert.equal(server, render("Asia/Kolkata"));
    assert.equal(server, render("America/Los_Angeles"));
    assert.match(server, /24 Oct 2026/);
    assert.match(server, /IST<\/small>/);
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});
