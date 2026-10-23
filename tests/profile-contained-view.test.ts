import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ProfileFlow, { ProfileContactFields } from "../app/profile-flow";
import { ProfileIcon } from "../app/profile-icons";

const render = (component: any, props: any) =>
  renderToStaticMarkup(createElement(component, props));
function elements(tree: unknown): ReactElement<any>[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!isValidElement<any>(tree)) return [];
  return [tree, ...elements(tree.props.children)];
}
test("profile mounts one step with a keyboard-focusable field region and named Next action", () => {
  const html = render(ProfileFlow, {
    data: { me: { name: "Alice", email: "alice@example.test" } },
    run: async () => ({}),
  });
  assert.match(html, /data-step="1"/);
  assert.equal((html.match(/<form /g) || []).length, 1);
  assert.match(html, /<fieldset class="profile-fields" tabindex="0">/);
  assert.match(html, /<span>Next<\/span><svg/);
  assert.doesNotMatch(
    html,
    /Next →|name="phone"|name="bestDescription"|OpenAI organization ID/,
  );
});
test("social trash controls preserve accessible names and remove only their own row", () => {
  const links = [
    { type: "GitHub", url: "https://github.com/alice" },
    { type: "Website", url: "https://example.test/alice" },
  ];
  let result = links;
  const props = {
    phone: "+12025550100",
    links,
    onPhone: () => {},
    onLinks: (value: typeof links) => {
      result = value;
    },
  };
  const tree = ProfileContactFields(props);
  const button = elements(tree).find(
    (node) => node.props["aria-label"] === "Remove social link 1",
  )!;
  button.props.onClick();
  assert.deepEqual(result, [links[1]]);
  const html = render(ProfileContactFields, props);
  assert.match(html, /aria-label="Remove social link 1"[^>]*><svg/);
  assert.doesNotMatch(html, />Remove<|required=""[^>]*type="url"/);
});
test("official Lucide controls remain decorative SVGs within named buttons", () => {
  for (const name of ["back", "next", "trash"]) {
    const html = render(ProfileIcon, { name });
    assert.match(html, /viewBox="0 0 24 24"/);
    assert.match(html, /aria-hidden="true" focusable="false"/);
    assert.match(html, /stroke="currentColor"/);
    assert.doesNotMatch(html, /<text|<image/);
  }
});
