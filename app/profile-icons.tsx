/**
 * Official Lucide SVG geometry, retrieved 2026-10-23 without a package dependency.
 * https://github.com/lucide-icons/lucide/tree/main/icons
 * arrow-left.svg, arrow-right.svg, trash.svg. See profile-icons.LICENSE.
 */
export function ProfileIcon({ name }: { name: "back" | "next" | "trash" }) {
  const paths = {
    back: ["m12 19-7-7 7-7", "M19 12H5"],
    next: ["M5 12h14", "m12 5 7 7-7 7"],
    trash: [
      "M10 11v6",
      "M14 11v6",
      "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",
      "M3 6h18",
      "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
    ],
  };
  return (
    <svg
      className="profile-control-icon"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
