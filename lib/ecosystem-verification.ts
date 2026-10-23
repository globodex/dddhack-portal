import type { submissionToolChoices } from "./submission-tools";
type Choice = (typeof submissionToolChoices)[number];
// Guidance for a future authorized source inspection; never a scoring formula.
export const ecosystemVerificationGuidance: Record<Choice, string> = {
  "OpenAI API":
    "Inspect actual API calls, SDK invocation, environment-variable references and server/proxy integration paths. Never require or disclose a plaintext API key. Verified absence after an accessible, complete inspection earns zero for this criterion; inaccessible or incomplete evidence stays unverified, not zero.",
  Codex:
    "Codex use is optional. Require explicit repository/workflow evidence; code style or design cannot establish attribution. Missing reliable evidence stays unverified for admin review.",
  "ChatGPT Sites":
    "Verify explicit deployment/source evidence for the declared Sites integration. A declaration alone does not establish it.",
  "Parallel Agents":
    "Inspect explicit workflow evidence of parallel agent use; do not infer it from code style or contributor names.",
  "Parallel worktrees":
    "Inspect explicit repository/workflow evidence of worktree use; do not infer it from branch or author count alone.",
  ChatGPT:
    "Inspect explicit supplied workflow evidence; a declaration alone does not establish use or a score.",
};
