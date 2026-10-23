"use client";
import { useState } from "react";
import {
  AdminIcon,
  useAdminOperation,
  type AdminRun,
} from "./admin-participant-actions";

export type AdminProjectTarget = {
  id: string;
  name: string;
  removed?: boolean;
};
export type AdminSubmissionTarget = {
  id: string;
  label: string;
  removed?: boolean;
};
export type ProjectRemovalScope = "project" | "submission" | "both";
export function projectActionValues(
  projectId: string,
  scope: ProjectRemovalScope,
  versionId: string,
  reason: string,
  restore: boolean,
) {
  if (!projectId || !reason.trim())
    throw new Error("A project and audit reason are required.");
  if (!["project", "submission", "both"].includes(scope))
    throw new Error("Choose a valid removal scope.");
  if (scope !== "project" && !versionId)
    throw new Error("Choose the exact submission version.");
  const suffix =
    scope === "project"
      ? "PROJECT"
      : scope === "submission"
        ? "SUBMISSION"
        : "BOTH";
  return {
    projectId,
    scope,
    ...(scope !== "project" ? { versionId } : {}),
    reason: reason.trim(),
    confirmation: `${restore ? "RESTORE" : "REMOVE"}_${suffix}`,
  };
}

export default function AdminProjectActions({
  project,
  versions,
  run,
}: {
  project: AdminProjectTarget;
  versions: readonly AdminSubmissionTarget[];
  run: AdminRun;
}) {
  const [scope, setScope] = useState<ProjectRemovalScope>("project");
  const [restore, setRestore] = useState(Boolean(project.removed));
  const [versionId, setVersionId] = useState("");
  const [reason, setReason] = useState("");
  const { busy, error, execute } = useAdminOperation();
  const selectedVersion = versions.find((version) => version.id === versionId);
  return (
    <form
      className="admin-control admin-project-action"
      onSubmit={(event) => {
        event.preventDefault();
        void execute(() => {
          if (scope !== "project" && !selectedVersion)
            throw new Error(
              "The selected submission is not available. Reload the project.",
            );
          return run(
            restore ? "project-restore" : "project-soft-delete",
            projectActionValues(project.id, scope, versionId, reason, restore),
          );
        });
      }}
    >
      <h3>
        <AdminIcon name="project" />
        Project and submission management
      </h3>
      <p>
        Project: <strong>{project.name}</strong>{" "}
        <span className="admin-control-id">({project.id})</span>
        {project.removed ? " · Removed" : ""}
      </p>
      <fieldset disabled={busy}>
        <div className="admin-control-grid">
          <label>
            Action
            <select
              value={restore ? "restore" : "remove"}
              onChange={(event) => setRestore(event.target.value === "restore")}
            >
              <option value="remove">Remove</option>
              <option value="restore">Restore</option>
            </select>
          </label>
          <label>
            Exact scope
            <select
              value={scope}
              onChange={(event) =>
                setScope(event.target.value as ProjectRemovalScope)
              }
            >
              <option value="project">Project only</option>
              <option value="submission" disabled={!versions.length}>
                One submission only
              </option>
              <option value="both" disabled={!versions.length}>
                Project and one submission
              </option>
            </select>
          </label>
        </div>
        {scope !== "project" && (
          <label>
            <span>
              Submission version <span aria-hidden="true">*</span>
            </span>
            <select
              required
              value={versionId}
              onChange={(event) => setVersionId(event.target.value)}
            >
              <option value="">Choose a supplied version</option>
              {versions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.label} · {version.id}
                  {version.removed ? " · Removed" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="admin-control-target">
          <strong>
            {restore ? "Restore" : "Remove"}:{" "}
            {scope === "project"
              ? project.name
              : scope === "submission"
                ? selectedVersion?.label || "Choose a submission"
                : `${project.name} and ${selectedVersion?.label || "the selected submission"}`}
          </strong>
          <p>
            {restore
              ? "Restore the selected target under current access and eligibility rules. The server may block restoration when dependencies are not eligible."
              : "Soft removal hides the selected target under server access rules. History, votes and comments are preserved; removal is recoverable. Another version is not automatically made public."}
          </p>
          <p>
            Committed attempts stay consumed. Removal and restoration never
            reset the hard limit of three submissions or reveal private scores.
          </p>
        </div>
        <label>
          <span>
            Audit reason <span aria-hidden="true">*</span>
          </span>
          <textarea
            required
            maxLength={1000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
          />
        </label>
        <button
          type="submit"
          className={`button ${restore ? "secondary" : "admin-control-danger"}`}
          disabled={
            busy || !reason.trim() || (scope !== "project" && !selectedVersion)
          }
        >
          {busy
            ? "Waiting…"
            : restore
              ? "Review restoration"
              : "Review removal"}
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
    </form>
  );
}
