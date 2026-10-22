import type { ReactNode } from "react";
import "./style.css";
export const metadata = {
  title: "DevDay Community Hackathon: New Delhi",
  description:
    "The participant and organizer workspace for DevDay Community Hackathon: New Delhi, 1 November 2026.",
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
