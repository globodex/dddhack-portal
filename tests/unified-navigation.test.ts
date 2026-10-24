import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Portal from "../app/portal";
import NavigationHeader, {
  navigationAvatarState,
} from "../app/navigation-header";
import { InformationHeader } from "../app/information-navigation";
import { dotColors } from "../lib/avatar-contract";

test("saved participant and staff avatars use the same header, without a separate desktop sidebar", () => {
  for (const [role, owner, color, expression, path] of [
    ["participant", false, "coral", "mixed-plus", "/dashboard"],
    ["admin", false, "purple", "star", "/admin/participants"],
    ["participant", true, "orange", "star", "/admin/participants"],
    ["judge", false, "green", "plus", "/projects"],
  ] as const) {
    const html = renderToStaticMarkup(
      createElement(Portal, {
        path,
        initialView: {
          me: {
            id: "fake_nav",
            email: "nav@portal.test",
            name: "Synthetic",
            role,
            owner,
            mode: "staff",
            avatarColor: color,
            avatarExpression: expression,
            hasProfileAvatar: true,
          },
        },
      }),
    );
    const header = html.match(
      /<header class="navigation-header"[\s\S]*?<\/header>/,
    )?.[0];
    assert.ok(header);
    assert.equal(
      (html.match(/<header class="navigation-header"/g) || []).length,
      1,
    );
    assert.match(header, /aria-label="Open navigation"/);
    assert.match(header, /data-avatar-state="saved"/);
    assert.ok(
      header.indexOf('class="navigation-account"') <
        header.indexOf('class="navigation-toggle"'),
      "Saved profile precedes the rightmost hamburger",
    );
    assert.ok(header.includes(`fill="${dotColors[color]}"`));
    assert.doesNotMatch(header, /lucide-user-round|nav@portal.test/);
    assert.doesNotMatch(html, /<aside class="sidebar"|id="public-navigation"/);
    assert.equal((html.match(/id="mobile-navigation"/g) || []).length, 1);
  }
});

test("missing profile is an explicit neutral placeholder, while old saved projections remain compatible", () => {
  assert.equal(navigationAvatarState(undefined), "anonymous");
  assert.equal(
    navigationAvatarState({
      avatarColor: "blue",
      avatarExpression: "squeezed",
      hasProfileAvatar: false,
    }),
    "placeholder",
  );
  assert.equal(
    navigationAvatarState({ avatarColor: "purple", avatarExpression: "star" }),
    "saved",
  );
  const html = renderToStaticMarkup(
    createElement(NavigationHeader, {
      account: {
        avatarColor: "blue",
        avatarExpression: "squeezed",
        hasProfileAvatar: false,
      },
      accountHref: "/profile",
      accountLabel: "Your profile",
      open: false,
      hydrated: true,
      onOpen() {},
    }),
  );
  assert.match(html, /data-avatar-state="placeholder"/);
  assert.match(html, /navigation-avatar-placeholder/);
  assert.doesNotMatch(html, /<circle|<text|lucide-user-round/);
});

test("standalone information/auth headers keep an anonymous sign-in affordance without inventing an actor", () => {
  for (const path of ["/privacy", "/terms", "/signin", "/personal/credits"]) {
    const html = renderToStaticMarkup(
      createElement(InformationHeader, { path }),
    );
    assert.match(html, /class="navigation-header"/);
    assert.match(html, /data-avatar-state="anonymous"/);
    assert.match(
      html,
      /href="\/signin\?returnTo=%2Fdashboard" aria-label="Sign in"/,
    );
    assert.match(html, /aria-haspopup="dialog" disabled=""/);
    assert.equal((html.match(/id="mobile-navigation"/g) || []).length, 1);
    assert.doesNotMatch(html, />Menu<|>Navigation<|>Administration<\/h/);
  }
});
