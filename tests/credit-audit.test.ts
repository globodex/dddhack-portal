import { test } from "node:test";
import assert from "node:assert/strict";
import {
  creditAuditMetadata,
  sanitizeCreditAuditText,
} from "../lib/credit-audit";

test("credit audit preserves useful prose and exposes only masked sample rows", () => {
  const audit = creditAuditMetadata([
    {
      heading: "Workshop credits",
      instructions:
        "Redeem once in your account. Ask an organizer if redemption fails.",
      values: ["SYNTHETIC-VOUCHER-ONE", "SYNTHETIC-VOUCHER-TWO"],
    },
  ]);
  assert.deepEqual(audit, [
    {
      heading: "Workshop credits",
      instructions:
        "Redeem once in your account. Ask an organizer if redemption fails.",
      count: 2,
      samples: [
        { row: 1, value: "[masked]" },
        { row: 2, value: "[masked]" },
      ],
    },
  ]);
});

test("every column masks all vouchers including short codes and cross-column accidents", () => {
  const columns = [
    {
      heading: "Synthetic voucher A1",
      instructions:
        "Do not paste Z9 here. A1 and encoded%20value were accidental.",
      values: ["A1", "value.with+[metachar]", "encoded value"],
    },
    {
      heading: "Z9 and value.with+[metachar]",
      instructions: "SYNTHETIC-ROW-6 must not appear in audit.",
      values: [
        "Z9",
        "SYNTHETIC-ROW-2",
        "SYNTHETIC-ROW-3",
        "SYNTHETIC-ROW-4",
        "SYNTHETIC-ROW-5",
        "SYNTHETIC-ROW-6",
      ],
    },
  ];
  const audit = creditAuditMetadata(columns);
  assert.equal(audit[1].count, 6);
  assert.equal(audit[1].samples.length, 5);
  assert.deepEqual(
    audit[1].samples.map((sample) => sample.row),
    [1, 2, 3, 4, 5],
  );
  const serialized = JSON.stringify(audit);
  for (const value of columns.flatMap((column) => column.values))
    assert.ok(!serialized.includes(value), value + " must not appear");
  assert.ok(!serialized.includes("encoded%20value"));
  assert.ok(!serialized.includes("fingerprint"));
  assert.equal(audit[0].heading, "Synthetic voucher [masked]");
});

test("known synthetic provider prefixes, assignments and opaque tokens are masked", () => {
  const tokens = [
    "sk-proj-SYNTHETIC_ONLY_1234567890",
    "sk-ant-SYNTHETIC_ONLY_1234567890",
    "ghp_SYNTHETIC_ONLY_1234567890",
    "github_pat_SYNTHETIC_ONLY_1234567890",
    "xoxb-SYNTHETIC-ONLY-1234567890",
    "AKIASYNTHETIC000000000",
    "AIzaSYNTHETIC_ONLY_123456789012345",
    "sk_test_SYNTHETICONLY123456",
    "SyntheticOpaqueMaterial0123456789",
    "qwertyuiopasdfghjklzxcvbnmasdfgh",
    "a".repeat(40),
  ];
  const text =
    tokens.join(" ") +
    '\nAPI_KEY="synthetic key with spaces" token=syntheticTiny password: syntheticPassword voucher: T1 code=K2 Bearer syntheticBearer';
  const safe = sanitizeCreditAuditText(text, []);
  for (const value of [
    ...tokens,
    "synthetic key with spaces",
    "syntheticTiny",
    "syntheticPassword",
    "T1",
    "K2",
    "syntheticBearer",
  ])
    assert.ok(!safe.includes(value), value + " must not appear");
  assert.match(safe, /API_KEY=\[masked\]/);
  assert.equal(
    sanitizeCreditAuditText(
      "Use the code editor. Keep the password manager open.",
      [],
    ),
    "Use the code editor. Keep the password manager open.",
  );
});

test("URL credentials, encoded query secrets and OAuth fragments never reach audit", () => {
  const text =
    "Redeem https://syntheticUser:syntheticPass@example.test/redeem?t%6Fken=syntheticToken&utm_source=workshop#access_token=syntheticFragment .";
  const safe = sanitizeCreditAuditText(text, []);
  for (const value of [
    "syntheticUser",
    "syntheticPass",
    "syntheticToken",
    "syntheticFragment",
  ])
    assert.ok(!safe.includes(value));
  assert.match(safe, /example\.test\/redeem/);
  assert.match(safe, /utm_source=workshop/);
  assert.ok(
    !sanitizeCreditAuditText(
      "https://example.test/?accessToken=syntheticTinySecret",
      [],
    ).includes("syntheticTinySecret"),
  );
  assert.match(
    sanitizeCreditAuditText(
      "https://example.test/?X-Amz-Signature=syntheticSignature",
      [],
    ),
    /\[masked\]/,
  );
});

test("bounded audit text sanitizes complete matches before cutting the output", () => {
  const voucher = "SYNTHETIC MULTIWORD VOUCHER";
  const safe = sanitizeCreditAuditText(
    "x ".repeat(4_997) + voucher + " remainder".repeat(1000),
    [voucher],
  );
  assert.ok(safe.length <= 10_000);
  assert.ok(!safe.includes("SYNTHETIC"));
  assert.equal(sanitizeCreditAuditText("A A", ["A"]), "[masked] [masked]");
  assert.equal(sanitizeCreditAuditText("safe text", ["", " "]), "safe text");
  assert.equal(sanitizeCreditAuditText("safe text", ["\ud800"]), "[masked]");
});

test("voucher literals cannot hide credential labels or corrupt existing masks", () => {
  assert.equal(
    sanitizeCreditAuditText("key=syntheticTinySecret", ["key"]),
    "[masked]=[masked]",
  );
  assert.equal(
    sanitizeCreditAuditText("token=syntheticTinySecret", ["a"]),
    "token=[masked]",
  );
  assert.equal(
    sanitizeCreditAuditText("value.with+[metachar]", ["value.with+[metachar]"]),
    "[masked]",
  );
  assert.equal(
    sanitizeCreditAuditText("valueXwithmmmm", ["value.with+[metachar]"]),
    "valueXwithmmmm",
  );
  assert.ok(
    !sanitizeCreditAuditText(
      'password="synthetic\\"quoted secret"',
      [],
    ).includes("secret"),
  );
  assert.ok(
    !sanitizeCreditAuditText("api_key=<syntheticTinySecret>", []).includes(
      "syntheticTinySecret",
    ),
  );
  assert.equal(
    sanitizeCreditAuditText(
      "-----BEGIN PRIVATE KEY-----\nsynthetic short material\n-----END PRIVATE KEY-----",
      [],
    ),
    "[masked]",
  );
  assert.ok(
    !sanitizeCreditAuditText(
      "postgres://syntheticUser:syntheticPass@example.test/db",
      [],
    ).includes("syntheticPass"),
  );
});
