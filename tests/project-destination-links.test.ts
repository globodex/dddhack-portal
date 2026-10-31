import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ProjectDestinationLinks, {
  projectDestination,
} from "../app/project-destination-links";

test("public links show repository/domain labels while preserving the supplied safe destination", () => {
  for (const input of [
    "https://github.com/example/repo/",
    "https://github.com/example/repo.git?tab=readme#intro",
    "https://www.github.com/example/repo/tree/main",
  ]) {
    const link = projectDestination(input, true)!;
    assert.equal(link.label, "example/repo");
    assert.equal(link.href, new URL(input).href);
  }
  assert.equal(
    projectDestination("https://github.com/example/", true)?.label,
    "github.com",
  );
  assert.deepEqual(
    projectDestination("https://www.example.test/deploy?q=1#demo"),
    { label: "example.test", href: "https://www.example.test/deploy?q=1#demo" },
  );
  for (const invalid of [
    undefined,
    "",
    "broken",
    "javascript:alert(1)",
    "http://example.test",
    "https://name:password@example.test/",
  ])
    assert.equal(projectDestination(invalid), undefined);
  for (const wrongHost of [
    "https://github.com.evil.test/a/b",
    "https://example.test/a/b",
  ])
    assert.equal(projectDestination(wrongHost, true), undefined);
  const html = renderToStaticMarkup(
    createElement(ProjectDestinationLinks, {
      github: "https://github.com/example/repo.git",
      demo: "https://demo.example.test/path",
    }),
  );
  assert.match(html, />example\/repo</);
  assert.match(html, />demo\.example\.test</);
  assert.match(html, /icons\/social\/github.svg/);
  assert.match(html, /lucide-globe/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /opens in a new tab/);
  assert.doesNotMatch(html, />GitHub<|Visit project/);
  assert.equal(
    renderToStaticMarkup(createElement(ProjectDestinationLinks, {})),
    "",
  );
});
