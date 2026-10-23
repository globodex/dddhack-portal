import type { Identity } from "../lib/identity";
import { batch, type Database } from "../lib/db";
import { draftPolicy } from "../lib/policy";
import { seal, sha256 } from "../lib/security";
export const LOCAL_CREDIT_KEY = btoa("0".repeat(32));
export const fixtures: Record<string, Identity> = Object.fromEntries(
  [
    "owner",
    "admin",
    "judge",
    "judge2",
    "alice",
    "bob",
    "carol",
    "dave",
    "eve",
    "frank",
    "gina",
    "hari",
    "ivy",
    "pending",
    "stranger",
  ].map((id) => [
    id,
    {
      id: "fake_" + id,
      email: id + "@portal.test",
      name: id[0].toUpperCase() + id.slice(1),
      source: "local-test",
      localOwner: id === "owner",
    },
  ]),
);
export async function seedLocal(db: Database) {
  const time = "2026-10-22T07:00:00.000Z";
  await batch(db, [
    [
      "INSERT INTO event_settings(id,policy) VALUES(1,?)",
      JSON.stringify(draftPolicy),
    ],
    ...Object.entries(fixtures).flatMap(([id, i]) => [
      [
        "INSERT INTO users(id,email,name,role,created_at) VALUES(?,?,?,?,?)",
        i.id,
        i.email,
        i.name,
        id === "admin"
          ? "admin"
          : id.startsWith("judge")
            ? "judge"
            : "participant",
        time,
      ] as [string, ...unknown[]],
      ["INSERT INTO profiles(user_id) VALUES(?)", i.id] as [
        string,
        ...unknown[],
      ],
      [
        "UPDATE profiles SET bio='Synthetic local builder profile',gender='non-binary' WHERE user_id=?",
        i.id,
      ] as [string, ...unknown[]],
      [
        "INSERT INTO participant_profiles(user_id,display_name,skills,completed_at,gender_confirmed) VALUES(?,?,?,?,1)",
        i.id,
        i.name,
        "Synthetic coding skills",
        time,
      ] as [string, ...unknown[]],
      ...(id === "stranger"
        ? []
        : [
            [
              "INSERT INTO registrations(email,status,luma_confirmed) VALUES(?,?,1)",
              i.email,
              id === "pending" ? "pending" : "approved",
            ] as [string, ...unknown[]],
          ]),
    ]),
  ]);
  for (const [id, name, leader, members] of [
    ["fake_team1", "Small Wonder", "alice", ["alice"]],
    ["fake_team3", "Common Ground", "bob", ["bob", "carol", "dave"]],
    [
      "fake_team5",
      "The Fifth Element",
      "eve",
      ["eve", "frank", "gina", "hari", "ivy"],
    ],
  ] as const) {
    await batch(db, [
      [
        "INSERT INTO teams VALUES(?,?,?,?,?)",
        id,
        name,
        "fake_" + leader,
        "A fake seed team for local rehearsal.",
        time,
      ],
      ...members.map(
        (m) =>
          ["INSERT INTO memberships VALUES(?,?,?)", "fake_" + m, id, time] as [
            string,
            ...unknown[],
          ],
      ),
      [
        "INSERT INTO ideas VALUES(?,?,?,?,?,?)",
        id,
        name + " idea",
        "A fake private core idea.",
        "A local rehearsal description.",
        await sha256(name),
        time,
      ],
    ]);
  }
  await batch(db, [
    [
      "INSERT INTO credit_types VALUES(?,?,?,1)",
      "fake_credit",
      "Builder boost (FAKE)",
      "Not redeemable. Local test inventory only.",
    ],
  ]);
  for (let n = 0; n < 20; n++) {
    const value = "FAKE-NOT-REDEEMABLE-" + String(n).padStart(3, "0");
    await batch(db, [
      [
        "INSERT INTO credit_inventory VALUES(?,?,?,?,?)",
        "fake_item_" + n,
        "fake_credit",
        await seal(value, LOCAL_CREDIT_KEY),
        await sha256(value),
        time,
      ],
    ]);
  }
  await batch(
    db,
    Object.entries(fixtures)
      .filter(([name]) => name !== "stranger")
      .map(([, i]) => [
        "INSERT INTO luma_roster VALUES(?,?,?)",
        i.email,
        "fake_owner",
        time,
      ]),
  );
  await batch(
    db,
    Object.values(fixtures).map((i) => [
      "INSERT INTO profile_details(user_id,phone) VALUES(?,?)",
      i.id,
      "+12025550100",
    ]),
  );
}
