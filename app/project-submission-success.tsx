"use client";
import { useRef } from "react";
import { Check } from "lucide-react";
import ProjectShare, { useProjectDialog } from "./project-share";
import {
  validProjectPublicPath,
  type SubmissionSuccessState,
} from "../lib/project-share";
import { trapDialogFocus } from "./dialog-focus";

export default function ProjectSubmissionSuccess({
  value,
  onClose,
}: {
  value: SubmissionSuccessState;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useProjectDialog(dialog, onClose);
  const publicPath = validProjectPublicPath(value.publicPath)
    ? value.publicPath
    : null;
  return (
    <dialog
      ref={dialog}
      className="project-submission-success"
      aria-labelledby="project-submission-success-title"
      aria-describedby="project-submission-success-attempt"
      onKeyDown={trapDialogFocus}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <span className="project-success-check" aria-hidden="true">
        <Check size={34} strokeWidth={2.5} />
      </span>
      <h2 id="project-submission-success-title">
        Project submitted successfully
      </h2>
      <span
        className="project-success-attempt"
        id="project-submission-success-attempt"
      >
        Submission {value.attempt}/3
      </span>
      {publicPath && (
        <div className="project-success-actions">
          <ProjectShare publicPath={publicPath} showLabel />
          <a className="button secondary" href={publicPath}>
            View project
          </a>
        </div>
      )}
      <button
        type="button"
        className="button project-success-done"
        data-initial-focus
        onClick={onClose}
      >
        Done
      </button>
    </dialog>
  );
}
