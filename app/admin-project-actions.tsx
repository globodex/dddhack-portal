"use client";
import { useHydrated } from "./use-hydrated";
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
  if (!projectId) throw new Error("Choose a project.");
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
    ...(reason.trim() ? { reason: reason.trim() } : {}),
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
  const hydrated = useHydrated();
  const [scope, setScope] = useState<ProjectRemovalScope>("project");
  const [restore, setRestore] = useState(Boolean(project.removed));
  const [versionId, setVersionId] = useState("");
  const { busy, error, execute } = useAdminOperation();
  const selectedVersion = versions.find((version) => version.id === versionId);
  return (
    <form
      method="post"
      inert={!hydrated}
      data-hydrated={hydrated}
      className="admin-control admin-project-action"
      onSubmit={(event) => {
        event.preventDefault();
        void execute(() => {
          if (scope !== "project" && !selectedVersion)
            throw new Error("Choose a submission version.");
          return run(
            restore ? "project-restore" : "project-soft-delete",
            projectActionValues(project.id, scope, versionId, "", restore),
          );
        });
      }}
    >
      <strong className="admin-action-project-name">{project.name}</strong>
      <fieldset
        disabled={!hydrated || busy}
        className="admin-project-fields"
      >
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
          Target
          <select
            value={scope}
            onChange={(event) =>
              setScope(event.target.value as ProjectRemovalScope)
            }
          >
            <option value="project">Project</option>
            <option value="submission" disabled={!versions.length}>
              Submission
            </option>
            <option value="both" disabled={!versions.length}>
              Project + submission
            </option>
          </select>
        </label>
        {scope !== "project" && (
          <label>
            Version
            <select
              required
              value={versionId}
              onChange={(event) => setVersionId(event.target.value)}
            >
              <option value="">Choose version</option>
              {versions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.label} · {version.id}
                  {version.removed ? " · Removed" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          className={`button ${restore ? "secondary" : "admin-icon-action admin-icon-danger"}`}
          aria-label={`${restore ? "Restore" : "Remove"} ${scope === "project" ? "project" : scope === "both" ? "project and submission" : "submission"}: ${project.name}${selectedVersion && scope !== "project" ? ` · ${selectedVersion.label} (${selectedVersion.id})` : ""}`}
          title={`${restore ? "Restore" : "Remove"} ${scope === "project" ? "project" : scope === "both" ? "project and submission" : "submission"}`}
          aria-busy={busy}
          type="submit"
          disabled={
            !hydrated || busy || (scope !== "project" && !selectedVersion)
          }
        >
          {restore ? busy ? "Waiting…" : "Restore" : <AdminIcon name="trash" />}
        </button>
      </fieldset>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
