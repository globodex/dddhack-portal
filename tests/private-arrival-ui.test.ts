import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "../app/home";
import { Dashboard, Settings } from "../app/portal";

const run = async () => { throw new Error("Rendering cannot mutate"); };
const privateVenue = { location: "SYNTHETIC ROOM TEST-201", directions: "Synthetic north entry for local proof only.", mapUrl: "https://www.google.com/maps/search/?api=1&query=Synthetic+Test+Venue" };
const me = { id: "fake", name: "Synthetic", email: "synthetic@portal.test", role: "participant", owner: false, mode: "participant", canParticipate: true };
const html = (component: any, props: any) => renderToStaticMarkup(createElement(component, props));

test("Home never invents an arrival payload and safely renders only its entitled enrichment prop", () => {
  const publicHome = html(Home, {});
  assert.match(publicHome, /IIIT Delhi/);
  assert.doesNotMatch(publicHome, /SYNTHETIC ROOM|Synthetic north entry/);
  const entitled = html(Home, { privateVenue });
  assert.match(entitled, /SYNTHETIC ROOM TEST-201/);
  assert.match(entitled, /Synthetic north entry/);
  assert.match(entitled, /https:\/\/www.google.com\/maps\/search/);
  const badLink = html(Home, { privateVenue: { ...privateVenue, mapUrl: "https://example.test/not-maps" } });
  assert.doesNotMatch(badLink, /example.test\/not-maps/);
});

test("an entitled teamless participant can see Dashboard arrival details without creating a team", () => {
  const markup = html(Dashboard, { data: { me, privateVenue, individualStatus: "Going" }, run });
  assert.match(markup, /Your arrival details/);
  assert.match(markup, /SYNTHETIC ROOM TEST-201/);
  assert.equal((markup.match(/aria-label="Your arrival details"/g) || []).length, 1);
  assert.doesNotMatch(html(Dashboard, { data: { me, individualStatus: "Registered" }, run }), /Your arrival details/);
});

test("private venue editing remains limited to the backend manager capability, separately from admin reading", () => {
  const venue = { draft: JSON.stringify(privateVenue), revision: 2 };
  const plainAdmin = html(Settings, { data: { me: { ...me, role: "admin" }, canManageVenue: false, venue }, run });
  assert.doesNotMatch(plainAdmin, /Private arrival details|SYNTHETIC ROOM|Private Google Maps URL/);
  for (const owner of [false, true]) {
    const allowed = html(Settings, { data: { me: { ...me, role: "admin", owner }, canManageVenue: true, venue }, run });
    assert.match(allowed, /Private arrival details/);
    assert.match(allowed, /Exact room or entry location/);
    assert.match(allowed, /Private directions/);
    assert.match(allowed, /Private Google Maps URL/);
    assert.match(allowed, /SYNTHETIC ROOM TEST-201/);
    if (!owner) assert.doesNotMatch(allowed, /Public event content/);
  }
});
