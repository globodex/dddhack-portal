import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { setup } from "./helpers";
import DiscoveryProfile, {
  discoveryProfileProjection,
} from "../app/discovery-profile";

test("selected profile email is staff-only, absent from cards, and immediately revoked with admin access", async () => {
  const f = await setup();
  try {
    const read = async (actor: string) =>
      f
        .service(actor)
        .view("/discover/participants", { person: "fake_bob" }) as Promise<any>;
    const email = f.db.raw
      .prepare("SELECT email FROM users WHERE id='fake_bob'")
      .get()!.email as string;
    for (const actor of ["owner", "admin"]) {
      const data = await read(actor);
      assert.equal(data.focusedPerson.details.email, email);
      assert.ok(!("email" in data.focusedPerson));
      assert.ok(
        data.items.every((p: any) => !("email" in p) && !("details" in p)),
      );
      const html = renderToStaticMarkup(
        createElement(DiscoveryProfile, {
          person: discoveryProfileProjection(data.focusedPerson),
          onClose() {},
        }),
      );
      assert.ok(html.includes(email));
      assert.match(html, /lucide-mail/);
    }
    for (const actor of ["alice", "bob", "carol", "stranger"]) {
      const data = await read(actor);
      assert.ok(!("email" in data.focusedPerson.details));
      assert.ok(!("email" in data.focusedPerson));
    }
    f.db.raw
      .prepare(
        "INSERT INTO portal_roles(user_id,role,granted_by,updated_at) VALUES('fake_admin','volunteer','fake_owner','2026-11-01T08:00:00Z')",
      )
      .run();
    assert.ok(!("email" in (await read("admin")).focusedPerson.details));
    f.db.raw
      .prepare("DELETE FROM participant_profiles WHERE user_id='fake_bob'")
      .run();
    f.db.raw
      .prepare("DELETE FROM profile_details WHERE user_id='fake_bob'")
      .run();
    assert.equal((await read("owner")).focusedPerson.details.email, email);
  } finally {
    f.db.close();
  }
});

test("profile renders only validated selected email, omitting raw or malformed values", () => {
  for (const value of [
    "",
    "not-an-email",
    "javascript:alert(1)",
    "x@example.invalid\nInjected",
  ]) {
    const person = discoveryProfileProjection({
      name: "Synthetic person",
      email: "raw@example.invalid",
      details: { email: value },
    });
    const html = renderToStaticMarkup(
      createElement(DiscoveryProfile, { person, onClose() {} }),
    );
    assert.doesNotMatch(html, /lucide-mail|raw@example|Injected|javascript:/);
  }
});
