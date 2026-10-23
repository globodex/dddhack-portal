// Latest user-confirmed participant choices, kept separate from verification.
// This is a declaration, not automatic evidence of tool usage or a score.
export const submissionToolChoices = [
  "OpenAI API",
  "Codex",
  "ChatGPT Sites",
  "Parallel Agents",
  "Parallel worktrees",
  "ChatGPT",
] as const;

export function selectedSubmissionTools(value: unknown): string[] {
  const selected = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,]/).map((item) => item.trim())
      : [];
  return submissionToolChoices.filter((choice) => selected.includes(choice));
}
