-- Owner-run READ ONLY against the actual portal database; no email/payload/secret output.
-- Versions are committed records, not drafts. Removed/terminal teams and removed versions are excluded.
WITH visible_versions AS (
  SELECT v.id,v.team_id
  FROM submission_versions v JOIN teams t ON t.id=v.team_id
  WHERE NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.kind='team' AND r.target_id=t.id AND r.active=1)
    AND NOT EXISTS(SELECT 1 FROM terminal_record_deletions d WHERE d.kind='team' AND d.target_id=t.id)
    AND NOT EXISTS(SELECT 1 FROM record_removals r WHERE r.kind='submission' AND r.target_id=v.id AND r.active=1)
)
SELECT count(*) AS committed_versions,
       count(DISTINCT v.team_id) AS teams_with_committed_versions,
       COALESCE(sum(CASE WHEN p.id IS NULL THEN 1 ELSE 0 END),0) AS versions_without_project_record,
       count(DISTINCT CASE WHEN p.id IS NULL THEN v.team_id END) AS teams_without_project_record
FROM visible_versions v LEFT JOIN projects p ON p.team_id=v.team_id;

-- Distinguishes drafts, committed pointers and a dangling pointer without returning project contents.
SELECT count(*) AS project_records,
       count(published_version_id) AS records_with_published_pointer,
       COALESCE(sum(CASE WHEN published_version_id IS NOT NULL AND NOT EXISTS(
         SELECT 1 FROM submission_versions v WHERE v.id=p.published_version_id AND v.team_id=p.team_id
       ) THEN 1 ELSE 0 END),0) AS invalid_published_pointers
FROM projects p;
