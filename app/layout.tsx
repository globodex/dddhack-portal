import type { ReactNode } from "react";
import "./style.css";
import "./public-home.css";
import "./home-lower.css";
import "./organizer-section.css";
import "./portrait-backdrop.css";
import "./participant-ui.css";
import "./admin-controls.css";
import "./navigation-correction.css";
import "./discovery-profile.css";
import "./dashboard-v6.css";
import "./discover-rules-v6.css";
import "./projects-submission-v6.css";
import "./portal-shell.css";
import "./mobile-navigation.css";
import "./route-skeleton.css";
import "./admin-credit-batches.css";
import "./personal-credits.css";
import "./redesign.css";
import "./profile-experience.css";
import "./team-discovery-experience.css";
import "./admin-experience.css";
import "./projects-rules-experience.css";
import "./team-studio-shell.css";
import "./team-studio-experience.css";
import "./confirmation-experience.css";
import "./unified-navigation.css";
export const metadata = {
  icons: { icon: "/brand/codex-user-supplied.svg" },
  title: "DevDay Exchange Community Hackathon: New Delhi",
  description:
    "The participant and organizer workspace for DevDay Exchange Community Hackathon: New Delhi, 1 November 2026.",
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
