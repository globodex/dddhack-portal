import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GenderSymbol, genderLabel } from "../app/gender-presentation";
import DiscoveryProfile, {
  discoveryDetailsProjection,
} from "../app/discovery-profile";
import ProfileFlow from "../app/profile-flow";
import { dotColors } from "../lib/avatar-contract";

const cases = [
  ["man", "Male", "mars"],
  ["woman", "Female", "venus"],
  ["non-binary", "Non-binary", "non-binary"],
] as const;
const person = {
  name: "Synthetic Builder",
  bio: "Saved bio",
  socials: [],
  avatarColor: "purple",
  avatarExpression: "mixed-plus",
};
const render = (component: any, props: any) =>
  renderToStaticMarkup(createElement(component, props));

test("saved gender enums choose their explicit label and Lucide symbol without gender colors or duplicate accessible names", () => {
  for (const [value, label, icon] of cases) {
    assert.equal(genderLabel(value), label);
    const symbol = render(GenderSymbol, { value });
    assert.match(symbol, new RegExp(`lucide-${icon}`));
    assert.match(symbol, /aria-hidden="true"/);
    assert.match(symbol, /focusable="false"/);
    assert.match(symbol, /stroke="currentColor"/);
    assert.doesNotMatch(symbol, /aria-label=|style="[^"]*color|#[a-f\d]{3,8}/i);
  }
});

test("legacy, unknown and missing values never infer a gender symbol or lose their existing meaning", () => {
  for (const [value, label] of [
    ["self-described", "Self-described"],
    ["prefer-not-to-say", "Prefer not to say"],
    ["custom legacy", "custom legacy"],
    ["constructor", "constructor"],
    ["toString", "toString"],
  ]) {
    assert.equal(genderLabel(value), label);
    assert.equal(render(GenderSymbol, { value }), "");
    const html = render(DiscoveryProfile, {
      person: { ...person, details: { gender: value } },
      onClose() {},
    });
    assert.ok(html.includes(label));
    assert.doesNotMatch(html, /lucide-(mars|venus|non-binary)/);
  }
  for (const value of [undefined, null, "", "   ", 0, {}, []]) {
    assert.equal(genderLabel(value), "");
    assert.equal(render(GenderSymbol, { value }), "");
  }
});

test("selected profile facts use the matching symbol and keep the saved expression avatar and approved data unchanged", () => {
  for (const [value, label, icon] of cases) {
    const details = {
      profession: "Working Professional",
      organization: "Saved organization",
      gender: value,
      phone: "+12025550123",
      whatsappUrl: "https://wa.me/12025550123",
      openaiOrgId: "org-synthetic-private",
    };
    assert.deepEqual(discoveryDetailsProjection(details), details);
    const html = render(DiscoveryProfile, {
      person: { ...person, details },
      onClose() {},
    });
    assert.match(html, new RegExp(`lucide-${icon}`));
    assert.match(html, new RegExp(`discovery-profile-gender-value">${label}<`));
    assert.match(html, /class="sr-only">Gender: /);
    assert.match(html, new RegExp(`fill="${dotColors.purple}"`));
    assert.match(html, /org-synthetic-private/);
    assert.match(html, /href="tel:\+12025550123"/);
    assert.match(html, /href="https:\/\/wa.me\/12025550123"/);
    assert.doesNotMatch(html, />Man<|>Woman</);
    assert.equal(details.gender, value);
  }
});

test("editor radio labels and symbols retain the stored selection, required controls and existing three choices", () => {
  for (const [value] of cases) {
    const profile = {
      display_name: "Synthetic Builder",
      gender: value,
      gender_confirmed: 1,
      bio: "Saved portal bio",
      avatar_color: "purple",
      avatar_expression: "mixed-plus",
    };
    const before = structuredClone(profile);
    const html = render(ProfileFlow, {
      data: { me: { email: "synthetic@example.test" }, profile },
      run: async () => ({}),
    });
    const radios = html.match(/<input[^>]*name="sex"[^>]*>/g) || [];
    assert.equal(radios.length, 3);
    assert.equal(
      radios.filter((input) => input.includes('checked=""')).length,
      1,
    );
    assert.match(
      radios.find((input) => input.includes('checked=""'))!,
      new RegExp(`value="${value}"`),
    );
    for (const [, label, icon] of cases) {
      assert.ok(html.includes(label));
      assert.match(html, new RegExp(`lucide-${icon}`));
    }
    assert.doesNotMatch(html, />Man<|>Woman</);
    assert.deepEqual(profile, before);
  }
});

test("presentation does not promote raw private fields into profile facts or expose key-shaped IDs and mismatched contacts", () => {
  const raw = {
    ...person,
    gender: "PRIVATE_RAW_GENDER",
    phone: "PRIVATE_RAW_PHONE",
    openaiOrgId: "org-private-raw",
  };
  const html = render(DiscoveryProfile, { person: raw, onClose() {} });
  assert.doesNotMatch(html, /PRIVATE_RAW|org-private-raw|Gender: /);
  assert.deepEqual(
    discoveryDetailsProjection({
      gender: "woman",
      openaiOrgId: "sk-proj-secret",
      phone: "+12025550123",
      whatsappUrl: "https://wa.me/99999999999",
    }),
    { gender: "woman", phone: "+12025550123" },
  );
});
