type NavigationActor = { owner?: boolean; role?: string; mode?: string };
// Presentation only. Every destination continues to enforce its server policy.
export function portalNavigation(path: string, me?: NavigationActor) {
  const privileged = !!(me?.owner || me?.role === "admin");
  const admin =
    path.startsWith("/admin") || (privileged && path.startsWith("/discover/"));
  const reviewer = ["judge", "mentor"].includes(me?.role || "");
  const items = admin
    ? [
        ["/admin/participants", "Participants"],
        ["/discover/teams", "Discover"],
        ...(privileged
          ? [
              ["/admin/teams", "Teams"],
              ["/admin/submissions", "Submissions"],
              ["/admin/credits", "Credits"],
              ["/admin/settings", "Settings"],
            ]
          : []),
        ["/rules", "Rules"],
        ...(me?.owner ? [["/admin/logs", "Logs"]] : []),
      ]
    : me
      ? [
          ...(me.mode === "viewer" ? [] : [["/dashboard", "Dashboard"]]),
          ["/discover/teams", "Discover"],
          ["/projects", "Projects"],
          ["/rules", "Rules"],
          ...(reviewer ? [["/review", "Assigned projects"]] : []),
        ]
      : [
          ["/", "Home"],
          ["/projects", "Projects"],
        ];
  return { privileged, admin, items };
}
