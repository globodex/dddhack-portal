import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTeamColor } from "../lib/team-color";
import { teamColorKeys, teamDotColors } from "../lib/avatar-contract";
import { teamPalettes } from "../lib/experience-contract";

test("team identity and media share one whitelisted color resolver including legacy and missing values", () => {
  for(const key of teamColorKeys) {
    const color=resolveTeamColor(key);
    assert.equal(color.key,key);assert.equal(color.fill,teamDotColors[key]);assert.equal(color.wash,teamPalettes[key].wash);
  }
  for(const key of ["lagoon","rose"] as const) {
    assert.equal(resolveTeamColor(key).fill,teamPalettes[key].ink);
    assert.equal(resolveTeamColor(key).wash,teamPalettes[key].wash);
  }
  for(const unknown of [null,undefined,"","unknown","__proto__","constructor","#fff","red",{}])
    assert.deepEqual(resolveTeamColor(unknown),resolveTeamColor("forest"));
  assert.equal(resolveTeamColor("coral").fill,"#ef5a6f");
  assert.equal(resolveTeamColor("yellow").fill,"#f2c744");
});
