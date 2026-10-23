import {
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  Plus,
  Trash2,
} from "lucide-react";

export function ProfileIcon({
  name,
}: {
  name: "back" | "next" | "trash" | "plus" | "check" | "external";
}) {
  const Component = {
    back: ArrowLeft,
    next: ArrowRight,
    trash: Trash2,
    plus: Plus,
    check: Check,
    external: ExternalLink,
  }[name];
  return (
    <Component
      className="profile-control-icon"
      size={20}
      strokeWidth={1.8}
      aria-hidden="true"
      focusable="false"
    />
  );
}
