import { Mars, NonBinary, Venus } from "lucide-react";

const labels: Record<string, string> = {
  man: "Male",
  woman: "Female",
  "non-binary": "Non-binary",
  "self-described": "Self-described",
  "prefer-not-to-say": "Prefer not to say",
};

/** Presentation only. Stored enums, selections and visibility stay with callers. */
export function genderLabel(value: unknown) {
  if (typeof value !== "string") return "";
  const saved = value.trim();
  return Object.hasOwn(labels, saved) ? labels[saved] : saved;
}

/** Adjacent visible text names the value; the symbol must not announce it twice. */
export function GenderSymbol({
  value,
  size = 20,
}: {
  value: unknown;
  size?: number;
}) {
  const saved = typeof value === "string" ? value.trim() : "";
  const Icon =
    saved === "man"
      ? Mars
      : saved === "woman"
        ? Venus
        : saved === "non-binary"
          ? NonBinary
          : null;
  return Icon ? (
    <Icon
      size={size}
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0 }}
    />
  ) : null;
}
