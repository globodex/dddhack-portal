// Safe, intentionally small Markdown subset. No HTML is interpreted, no URL is fetched.
export type InstructionBlock = {
  type: "heading" | "paragraph" | "ordered" | "unordered" | "code";
  lines: string[];
};
export type InstructionInline = {
  type: "text" | "strong" | "code" | "link";
  text: string;
  href?: string;
};
export function safeInstructionURL(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password && !u.port
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
}
export function instructionInline(value: string): InstructionInline[] {
  const out: InstructionInline[] = [];
  const token =
    /\*\*([^*\n]{1,2000})\*\*|`([^`\n]{1,2000})`|\[([^\]\n]{1,500})\]\(([^\s)]{1,2048})\)/g;
  let at = 0;
  for (const match of value.matchAll(token)) {
    if (match.index! > at)
      out.push({ type: "text", text: value.slice(at, match.index) });
    if (match[1]) out.push({ type: "strong", text: match[1] });
    else if (match[2]) out.push({ type: "code", text: match[2] });
    else {
      const href = safeInstructionURL(match[4]);
      out.push({
        type: href ? "link" : "text",
        text: match[3],
        ...(href ? { href } : {}),
      });
    }
    at = match.index! + match[0].length;
  }
  if (at < value.length) out.push({ type: "text", text: value.slice(at) });
  return out;
}
export function parseInstructions(value: string): InstructionBlock[] {
  const blocks: InstructionBlock[] = [];
  let fenced = false;
  for (const line of value
    .slice(0, 10000)
    .replace(/\r\n?/g, "\n")
    .split("\n")) {
    if (line.startsWith("```")) {
      fenced = !fenced;
      if (fenced) blocks.push({ type: "code", lines: [] });
      continue;
    }
    if (fenced) {
      blocks.at(-1)!.lines.push(line);
      continue;
    }
    if (!line.trim()) continue;
    const heading = /^#{1,6}\s+(.+)$/.exec(line),
      ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line),
      unordered = /^\s*[-*+]\s+(.+)$/.exec(line);
    const type = heading
        ? "heading"
        : ordered
          ? "ordered"
          : unordered
            ? "unordered"
            : "paragraph",
      text = (heading || ordered || unordered)?.[1] || line;
    const previous = blocks.at(-1);
    if (previous?.type === type && ["ordered", "unordered"].includes(type))
      previous.lines.push(text);
    else blocks.push({ type, lines: [text] });
  }
  return blocks;
}
