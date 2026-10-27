export const adminBackendUpdateMessage =
  "This feature is unavailable on the connected backend. Deploy the matching backend package, then reload.";

/** Missing server aggregates are not zero counts. Ordinary audiences get no staff diagnostics. */
export default function AdminBackendNotice({
  me,
  stats,
}: {
  me?: { role?: string; owner?: boolean };
  stats?: unknown;
}) {
  if (stats || !(me?.owner || me?.role === "admin")) return null;
  return (
    <p className="admin-backend-notice" role="alert">
      Statistics are unavailable from the backend. Deploy the matching backend
      package, then reload.
    </p>
  );
}
