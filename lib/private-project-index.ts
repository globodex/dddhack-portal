import type { PortalService } from "./service";
import { rows } from "./db";
import {
  demographicPredicate,
  type AdminDemographics,
} from "./admin-demographic-filters";
/** Real committed versions without a projects index. Private staff projection only; no fabricated project URL. */
export async function unindexedSubmissions(
  s: PortalService,
  filters: AdminDemographics = {},
  windowOpened = false,
) {
  await s.staff();
  const filter = demographicPredicate("team", "t.id", filters, windowOpened);
  return rows(
    s.db,
    `SELECT v.id,t.id teamId,t.name teamName,json_extract(v.payload,'$.projectName') projectName,v.created_at updated_at,v.attempt,'Submitted' status,1 projectIndexMissing,
 (SELECT count(*) FROM submission_versions all_v WHERE all_v.team_id=t.id AND NOT EXISTS(SELECT 1 FROM record_removals sr WHERE sr.kind='submission' AND sr.target_id=all_v.id AND sr.active=1)) committedVersions
 FROM teams t JOIN submission_versions v ON v.team_id=t.id
 WHERE NOT EXISTS(SELECT 1 FROM projects p WHERE p.team_id=t.id)
 AND NOT EXISTS(SELECT 1 FROM record_removals tr WHERE tr.kind='team' AND tr.target_id=t.id AND tr.active=1)
 AND NOT EXISTS(SELECT 1 FROM terminal_record_deletions td WHERE td.kind='team' AND td.target_id=t.id)
 AND NOT EXISTS(SELECT 1 FROM record_removals sr WHERE sr.kind='submission' AND sr.target_id=v.id AND sr.active=1)
 AND v.attempt=(SELECT max(last_v.attempt) FROM submission_versions last_v WHERE last_v.team_id=t.id AND NOT EXISTS(SELECT 1 FROM record_removals sr WHERE sr.kind='submission' AND sr.target_id=last_v.id AND sr.active=1))
 AND ${filter.sql} ORDER BY v.created_at DESC,v.id LIMIT 1000`,
    ...filter.args,
  );
}
