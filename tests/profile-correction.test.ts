import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ProfileFlow, {
  ProfileAvatarPicker,
  ProfileContactFields,
  ProfileDescriptionField,
  profileSocialRows,
  profileSocialPayload,
} from "../app/profile-flow";
import { dotColors, dotExpressions } from "../lib/avatar-contract";
import { profileDescriptionChoices } from "../lib/profile-contract";

const noop = () => {};
const render = (component: any, props: any) =>
  renderToStaticMarkup(createElement(component, props));
function elements(tree: unknown): ReactElement<any>[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!isValidElement<any>(tree)) return [];
  return [tree, ...elements(tree.props.children)];
}

test("profile keeps authenticated email, required basics, and avatar before fields in mobile reading order", () => {
  const html = render(ProfileFlow, {
    data: {
      me: { name: "Alex Rivera", email: "auth@example.invalid" },
      profile: { email: "import@example.invalid" },
    },
    run: async () => ({}),
  });
  assert.match(html, /Step 1 of 3/);
  assert.match(
    html,
    /type="email"[^>]*readOnly=""[^>]*name="email"[^>]*value="auth@example.invalid"/,
  );
  assert.doesNotMatch(
    html,
    /import@example.invalid|type="file"|Review profile/,
  );
  assert.ok(
    html.indexOf('class="profile-avatar"') < html.indexOf('name="fullName"'),
  );
  assert.match(html, /<input[^>]*required=""[^>]*name="bio"/);
  assert.equal((html.match(/name="sex"/g) || []).length, 3);
  assert.doesNotMatch(html, /name="sex" checked=""/);
});

test("all eight colors and expressions are individually labelled native radios with exactly one selection per group", () => {
  for (const color of Object.keys(dotColors)) {
    const html = render(ProfileAvatarPicker, {
      color,
      expression: "mixed-slash",
      onColor: noop,
      onExpression: noop,
    });
    assert.equal((html.match(/name="avatarColor"/g) || []).length, 8);
    assert.equal((html.match(/name="avatarExpression"/g) || []).length, 8);
    assert.equal((html.match(/checked=""/g) || []).length, 2);
    assert.ok(html.includes(`name="avatarColor" checked="" value="${color}"`));
    assert.match(html, /<legend>Color<\/legend>/);
    assert.match(html, /<legend>Expression<\/legend>/);
    assert.match(html, /class="sr-only">Mixed slash/);
  }
  let pickedColor = "blue",
    pickedExpression = "squeezed";
  const tree = ProfileAvatarPicker({
    color: pickedColor,
    expression: pickedExpression,
    onColor: (v) => {
      pickedColor = v;
    },
    onExpression: (v) => {
      pickedExpression = v;
    },
  });
  const choices = elements(tree).filter((node) => node.type === "input");
  for (const value of Object.keys(dotColors)) {
    choices
      .find(
        (node) =>
          node.props.name === "avatarColor" && node.props.value === value,
      )!
      .props.onChange();
    assert.equal(pickedColor, value);
  }
  for (const value of Object.keys(dotExpressions)) {
    choices
      .find(
        (node) =>
          node.props.name === "avatarExpression" && node.props.value === value,
      )!
      .props.onChange();
    assert.equal(pickedExpression, value);
  }
});

test("social prefill retains multiple links per platform and typed labels, deduplicates legacy URLs, and omits empty rows on save", () => {
  const rows = profileSocialRows({
    socialLinks: [
      { type: "Website", url: " https://github.com/portfolio " },
      { type: "GitHub", url: "https://github.com/main" },
      { type: "GitHub", url: "https://github.com/other" },
      null,
    ],
    socials: ["https://github.com/main", "https://x.com/alex"],
  });
  assert.deepEqual(rows, [
    { type: "Website", url: "https://github.com/portfolio" },
    { type: "GitHub", url: "https://github.com/main" },
    { type: "GitHub", url: "https://github.com/other" },
    { type: "X", url: "https://x.com/alex" },
  ]);
  assert.deepEqual(
    profileSocialPayload([...rows, { type: "Website", url: "  " }]),
    rows,
  );
  assert.deepEqual(profileSocialPayload(profileSocialRows({})), []);
});

test("contact starts with one optional social row; add, select, edit, and remove callbacks preserve other rows", () => {
  let links = profileSocialRows({});
  const props = () => ({
    phone: "+12025550123",
    links,
    onPhone: noop,
    onLinks: (value: typeof links) => {
      links = value;
    },
  });
  const html = render(ProfileContactFields, props());
  assert.equal((html.match(/type="url"/g) || []).length, 1);
  assert.match(html, /src="\/icons\/social\/linkedin.svg"/);
  assert.match(html, /<select title="LinkedIn">/);
  assert.equal((html.match(/optional/g) || []).length, 2); // class and one shared label
  assert.match(html, /type="tel"[^>]*required=""/);
  assert.doesNotMatch(html, /type="url"[^>]*required/);
  let tree = elements(ProfileContactFields(props()));
  tree
    .find((node) => node.props.className === "profile-add-link")!
    .props.onClick();
  assert.equal(links.length, 2);
  tree = elements(ProfileContactFields(props()));
  tree
    .filter((node) => node.type === "select")[1]
    .props.onChange({ target: { value: "Instagram" } });
  tree = elements(ProfileContactFields(props()));
  tree
    .filter((node) => node.type === "input" && node.props.type === "url")[1]
    .props.onChange({ target: { value: "https://instagram.com/alex" } });
  assert.deepEqual(links, [
    { type: "LinkedIn", url: "" },
    { type: "Instagram", url: "https://instagram.com/alex" },
  ]);
  tree = elements(ProfileContactFields(props()));
  tree
    .filter((node) => node.props.className === "profile-remove-link")[0]
    .props.onClick();
  assert.deepEqual(links, [
    { type: "Instagram", url: "https://instagram.com/alex" },
  ]);
  links = Array.from({ length: 8 }, () => ({ type: "Website", url: "" }));
  assert.equal(
    elements(ProfileContactFields(props())).find(
      (node) => node.props.className === "profile-add-link",
    )!.props.disabled,
    true,
  );
});

test("about-you choices retain exactly the verified Luma options", () => {
  const tree = elements(
    ProfileDescriptionField({ value: "Independent Developer", onChange: noop }),
  );
  assert.deepEqual(
    tree
      .filter((node) => node.type === "option" && node.props.value)
      .map((node) => node.props.value),
    profileDescriptionChoices,
  );
});
