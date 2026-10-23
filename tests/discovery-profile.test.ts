import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import DiscoveryProfile, {
  discoverySocialLinks,
  openDiscoveryDialog,
} from "../app/discovery-profile";

const person = {
  name: "Priya Sharma",
  bio: "Enjoys product design",
  socials: ["https://github.com/priya", "https://www.linkedin.com/in/priya"],
  avatarColor: "green",
  avatarExpression: "mixed-plus",
};

test("Discovery renders only allowlisted profile fields in a labelled native dialog", () => {
  const html = renderToStaticMarkup(
    createElement(DiscoveryProfile, {
      person: {
        ...person,
        email: "private@example.test",
        phone: "+12025550100",
        sex: "private-sex",
        orgId: "private-org-id",
        teamIdea: "private-team-idea",
      } as typeof person,
      onClose: () => {},
    }),
  );
  assert.match(
    html,
    /<dialog[^>]*aria-labelledby="[^"]+"[^>]*aria-describedby="[^"]+"/,
  );
  assert.match(html, /Priya Sharma/);
  assert.match(html, /Enjoys product design/);
  assert.match(html, /aria-label="Close profile"/);
  assert.match(html, /autofocus=""/);
  assert.match(html, /icons\/social\/github.svg/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(
    html,
    /private@example|12025550100|private-sex|private-org-id|private-team-idea/,
  );
});

test("socials reject unsafe schemes and credentials and deduplicate canonical URLs", () => {
  const links = discoverySocialLinks([
    "javascript:alert(1)",
    "http://github.com/priya",
    "//github.com/priya",
    "not a URL",
    "https://user:password@github.com/priya",
    "https://user@github.com/priya",
    "https://GITHUB.com/priya",
    "https://github.com/priya",
    "https://example.test",
  ]);
  assert.deepEqual(links, [
    { href: "https://github.com/priya", icon: "github", label: "GitHub" },
    { href: "https://example.test/", icon: "website", label: "example.test" },
  ]);
});

test("platform icons require exact platform hosts, including supported www aliases", () => {
  const links = discoverySocialLinks([
    "https://www.linkedin.com/in/priya",
    "https://twitter.com/priya",
    "https://x.com/priya",
    "https://www.instagram.com/priya",
    "https://github.com.evil.test/priya",
    "https://notgithub.com/priya",
  ]);
  assert.deepEqual(
    links.map(({ icon }) => icon),
    ["linkedin", "x", "x", "instagram", "website", "website"],
  );
});

test("empty bio and socials omit empty sections without disclosing extra fields", () => {
  const html = renderToStaticMarkup(
    createElement(DiscoveryProfile, {
      person: { ...person, bio: "", socials: ["javascript:alert(1)"] },
      onClose: () => {},
    }),
  );
  assert.doesNotMatch(
    html,
    /aria-describedby|Social links|discovery-profile-bio/,
  );
});

function nativeDialogFixture() {
  let focused = 0;
  let modalCalls = 0;
  const trigger = {
    isConnected: true,
    focus: () => {
      focused++;
    },
  };
  class Dialog extends EventTarget {
    open = false;
    ownerDocument = { activeElement: trigger };
    showModal() {
      this.open = true;
      modalCalls++;
    }
    close() {
      if (!this.open) return;
      this.open = false;
      this.dispatchEvent(new Event("close"));
    }
  }
  return {
    dialog: new Dialog(),
    trigger,
    focused: () => focused,
    modalCalls: () => modalCalls,
  };
}

test("native modal close restores its opener and calls onClose once", () => {
  const fixture = nativeDialogFixture();
  let calls = 0;
  const cleanup = openDiscoveryDialog(
    fixture.dialog as unknown as HTMLDialogElement,
    () => {
      calls++;
    },
  );
  assert.equal(fixture.modalCalls(), 1);
  assert.equal(fixture.dialog.open, true);
  fixture.dialog.close();
  fixture.dialog.dispatchEvent(new Event("close"));
  assert.equal(calls, 1);
  assert.equal(fixture.focused(), 1);
  cleanup();
  assert.equal(calls, 1);
});

test("Escape cancel closes the native dialog, and unmount cleanup never calls onClose", () => {
  const fixture = nativeDialogFixture();
  let calls = 0;
  const cleanup = openDiscoveryDialog(
    fixture.dialog as unknown as HTMLDialogElement,
    () => {
      calls++;
    },
  );
  const cancel = new Event("cancel", { cancelable: true });
  fixture.dialog.dispatchEvent(cancel);
  assert.equal(cancel.defaultPrevented, true);
  assert.equal(fixture.dialog.open, false);
  assert.equal(calls, 1);
  cleanup();
  const second = nativeDialogFixture();
  const cleanupSecond = openDiscoveryDialog(
    second.dialog as unknown as HTMLDialogElement,
    () => {
      calls++;
    },
  );
  second.trigger.isConnected = false;
  cleanupSecond();
  assert.equal(second.dialog.open, false);
  assert.equal(second.focused(), 0);
  assert.equal(calls, 1);
});
