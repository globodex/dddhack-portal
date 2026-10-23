import { LocalDatabase } from "../lib/local-test/sqlite";
import { fixtures, seedLocal, LOCAL_CREDIT_KEY } from "../scripts/fixtures";
import { PortalService } from "../lib/service";
import { draftPolicy, decisions, type Policy } from "../lib/policy";
import { batch } from "../lib/db";
export async function setup(path = ":memory:") {
  const db = new LocalDatabase(path);
  db.migrate();
  await seedLocal(db);
  let time = "2026-10-22T08:00:00.000Z";
  return {
    db,
    clock: (value: string) => {
      time = value;
    },
    service: (name = "alice") =>
      new PortalService(db, fixtures[name], LOCAL_CREDIT_KEY, () => time),
  };
}
export const rehearsalPolicy: Policy = {
  ...draftPolicy,
  submissionClose: "2026-11-01T10:30:00.000Z",
  judgingClose: "2026-11-01T12:30:00.000Z",
  engagementOpen: "2026-11-01T10:30:00.000Z",
  engagementClose: "2026-11-01T12:00:00.000Z",
  diversityAssessment: "non-demographic-evidence",
  diversityRubric:
    "FAKE REHEARSAL: complementary skills and documented collaboration. No sensitive attributes.",
  voteFormula: "sqrt-relative",
  aiFallback:
    "FAKE REHEARSAL: two staff reviewers independently assess evidence and agree a manual score.",
  tieBreak: "FAKE REHEARSAL: hold publication for explicit owner adjudication.",
  codexReviewer: "FAKE REHEARSAL: lead judge",
  appealClose: "2026-11-01T12:00:00.000Z",
  deploymentRule: "FAKE REHEARSAL: demo or reproducible CLI instructions.",
  penaltyApproved: true,
  retentionNotice: "FAKE REHEARSAL: synthetic data only; delete after test.",
  confirmations: [...decisions],
  capacity: 160,
  scoringDisclosure: {
    criteria: "Synthetic rehearsal rubric only",
    weightage: "Synthetic fixture weights; not an approved event policy",
    confirmed: true,
  },
  teamFormationRule:
    "FAKE REHEARSAL ONLY: October freeze, not a live event decision.",
  projectEngagementRule: "display-only",
};
export async function activate(db: LocalDatabase) {
  await batch(db, [
    [
      "UPDATE event_settings SET policy=?,active=1 WHERE id=1",
      JSON.stringify(rehearsalPolicy),
    ],
  ]);
}
export const submission = {
  projectName: "Fake project",
  problemSolution: "A useful project solving a clear problem.",
  description: "A fake project built in rehearsal.",
  github: "https://github.com/example/fake-project",
  demo: "",
  video: "",
  gtm: "Community-led distribution with a sustainable model.",
  features: "Search, save and share.",
  tools: "Codex CLI",
  toolEffectiveness:
    "Used Codex to implement tests and debug the storage flow.",
  contributions: [
    {
      userId: "fake_alice",
      role: "Built the prototype",
      codex: "Debugged and tested with Codex",
    },
  ],
  openaiClaim: false,
  cerebrasClaim: false,
  openaiEvidence: "",
  cerebrasEvidence: "",
  attestation: true,
};
