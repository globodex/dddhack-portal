import type { ReactNode } from "react";
import "./style.css";
export const metadata = {
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
