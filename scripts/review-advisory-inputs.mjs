import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
// A bounded, caught local check of the still-unpatched tooling vulnerability.
// This does not run a payload against a hosted service or leave a server running.
const child = `
const braces = require("braces");
const depth = 2048;
const input = "{".repeat(depth) + "x" + "}".repeat(depth);
let outcome;
try { braces.compile(input); outcome = "compiled"; }
catch (error) { outcome = error.name; }
console.log(JSON.stringify({ depth, characters: input.length, outcome }));
`;
const result = JSON.parse(
  execFileSync(
    process.execPath,
    ["--max-old-space-size=64", "--stack_size=256", "-e", child],
    {
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 8192,
    },
  ),
);
const report = {
  advisory: "GHSA-vfj7-8cjw-p6xm",
  isolatedNodeProcess: true,
  maxHeapMiB: 64,
  timeoutMs: 5000,
  ...result,
  conclusion:
    "The installed build dependency remains vulnerable; production mitigation is artifact exclusion and absence of runtime glob compilation, not a dependency patch.",
};
writeFileSync(
  "evidence/sites-advisory-inputs.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
