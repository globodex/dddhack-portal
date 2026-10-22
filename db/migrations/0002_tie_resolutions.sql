CREATE TABLE tie_resolutions(group_hash TEXT NOT NULL,team_id TEXT NOT NULL REFERENCES teams(id),ordinal INTEGER NOT NULL CHECK(ordinal>0),PRIMARY KEY(group_hash,team_id),UNIQUE(group_hash,ordinal));
CREATE TRIGGER frozen_tie_insert BEFORE INSERT ON tie_resolutions WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;
CREATE TRIGGER revision_tie_insert AFTER INSERT ON tie_resolutions BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
CREATE TRIGGER frozen_tie_update BEFORE UPDATE ON tie_resolutions WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;
CREATE TRIGGER revision_tie_update AFTER UPDATE ON tie_resolutions BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
CREATE TRIGGER frozen_tie_delete BEFORE DELETE ON tie_resolutions WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;
CREATE TRIGGER revision_tie_delete AFTER DELETE ON tie_resolutions BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
