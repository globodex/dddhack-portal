import assert from "node:assert/strict";
import { test } from "node:test";
import {
  genderBreakdownDisplay,
  profileGenderChoices,
} from "../app/profile-gender-options";

test("analytics uses precisely the current editor choices, including genuine zero counts", () => {
  assert.deepEqual(profileGenderChoices, [
    { key: "man", label: "Male" },
    { key: "woman", label: "Female" },
    { key: "non-binary", label: "Non-binary" },
  ]);
  const display = genderBreakdownDisplay([]);
  assert.deepEqual(
    display.choices.map((choice) => choice.value),
    [0, 0, 0],
  );
  assert.equal(display.notProvided, 0);
  assert.equal(display.otherSaved, 0);
});

test("legacy, missing and unmapped records reconcile separately without changing or exposing their saved values", () => {
  const buckets = [
    { key: "man", label: "Male", value: 2 },
    { key: "woman", label: "Female", value: 3 },
    { key: "non-binary", label: "Non-binary", value: 0 },
    { key: "self-described", label: "Self-described", value: 1 },
    { key: "prefer-not-to-say", label: "Prefer not to say", value: 2 },
    { key: "not-provided", label: "Not provided", value: 4 },
    { key: "unknown-historic", label: "PRIVATE SAVED TEXT", value: 1 },
  ];
  const before = structuredClone(buckets),
    display = genderBreakdownDisplay(buckets);
  assert.equal(display.notProvided, 4);
  assert.equal(display.otherSaved, 4);
  assert.equal(
    display.choices.reduce((sum, choice) => sum + choice.value, 0) +
      display.notProvided +
      display.otherSaved,
    buckets.reduce((sum, bucket) => sum + bucket.value, 0),
  );
  assert.doesNotMatch(
    JSON.stringify(display),
    /PRIVATE|Self-described|Prefer not/,
  );
  assert.deepEqual(buckets, before);
});

test("all-missing and all-legacy cohorts retain their entire totals without a made-up current selection", () => {
  for (const key of [
    "not-provided",
    "self-described",
    "prefer-not-to-say",
    "unmapped",
  ]) {
    const display = genderBreakdownDisplay([{ key, label: key, value: 7 }]);
    assert.ok(display.choices.every((choice) => choice.value === 0));
    assert.equal(display.notProvided + display.otherSaved, 7);
  }
});
