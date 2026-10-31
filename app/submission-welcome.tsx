"use client";
import { useId } from "react";
import { CalendarDays, Sparkles, RefreshCw } from "lucide-react";

type SubmissionView = Record<string, any>;
/** UI fail-closed compatibility only. All authority and payload filtering remain on the server. */
export function submissionContentHidden(data: SubmissionView) {
  const access = data.submissionAccess;
  if (access?.adminSubmissionTest === true) return false;
  if (typeof access?.contentHidden === "boolean") return access.contentHidden;
  return !(access?.windowHasOpened === true || access?.canCommit === true);
}
export default function SubmissionWelcome({ data }: { data: SubmissionView }) {
  const id = useId();
  const opening = data.submissionAccess?.opensAt;
  const scheduled =
    typeof opening === "string" &&
    Number.isFinite(Date.parse(opening)) &&
    Number.isFinite(Date.parse(data.submissionAccess?.serverNow || "")) &&
    Date.parse(opening) > Date.parse(data.submissionAccess?.serverNow);
  return (
    <section className="submission-welcome" aria-labelledby={id}>
      <span className="submission-welcome-mark" aria-hidden="true">
        <Sparkles size={32} />
      </span>
      <p className="submission-welcome-eyebrow">Your project workspace</p>
      <h2 id={id}>We’re looking forward to your project.</h2>
      <p>
        {scheduled
          ? "Keep building. Your submission workspace will open here at the scheduled time."
          : "Your submission workspace isn’t available yet. Check back here for the opening."}
      </p>
      {scheduled && (
        <div className="submission-welcome-date">
          <CalendarDays size={20} aria-hidden="true" />
          <span>
            Opens{" "}
            <time dateTime={opening}>
              {new Intl.DateTimeFormat("en-IN", {
                timeZone: "Asia/Kolkata",
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              }).format(new Date(opening))}{" "}
              IST
            </time>
          </span>
        </div>
      )}
      <button
        type="button"
        className="button secondary"
        onClick={() =>
          window.dispatchEvent(new Event("portal-submission-refresh"))
        }
      >
        <RefreshCw size={17} aria-hidden="true" />
        Refresh availability
      </button>
    </section>
  );
}
