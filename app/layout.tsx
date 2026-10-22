import type { ReactNode } from "react";
import "./style.css";
export const metadata = {
  title: "DevDay Exchange · Build something that matters",
  description:
    "The community hackathon workspace for DevDay Exchange, 1 November 2026.",
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
