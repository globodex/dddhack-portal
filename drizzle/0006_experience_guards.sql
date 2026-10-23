CREATE TRIGGER revised_revision_project_review_history_insert AFTER INSERT ON project_review_history BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revised_frozen_project_review_history_insert BEFORE INSERT ON project_review_history WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER revised_revision_project_review_history_update AFTER UPDATE ON project_review_history BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revised_frozen_project_review_history_update BEFORE UPDATE ON project_review_history WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER revised_revision_project_review_history_delete AFTER DELETE ON project_review_history BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revised_frozen_project_review_history_delete BEFORE DELETE ON project_review_history WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER revised_revision_project_assignments_insert AFTER INSERT ON project_assignments BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revised_revision_project_assignments_update AFTER UPDATE ON project_assignments BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revised_revision_project_assignments_delete AFTER DELETE ON project_assignments BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revised_revision_project_eligibility_insert AFTER INSERT ON project_eligibility BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revised_frozen_project_eligibility_insert BEFORE INSERT ON project_eligibility WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER revised_revision_project_eligibility_update AFTER UPDATE ON project_eligibility BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revised_frozen_project_eligibility_update BEFORE UPDATE ON project_eligibility WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER revised_revision_project_eligibility_delete AFTER DELETE ON project_eligibility BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revised_frozen_project_eligibility_delete BEFORE DELETE ON project_eligibility WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER revised_revision_portal_roles_insert AFTER INSERT ON portal_roles BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revised_revision_portal_roles_update AFTER UPDATE ON portal_roles BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revised_revision_portal_roles_delete AFTER DELETE ON portal_roles BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revised_revision_project_upvotes_insert AFTER INSERT ON project_upvotes BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revised_revision_project_upvotes_update AFTER UPDATE ON project_upvotes BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revised_revision_project_upvotes_delete AFTER DELETE ON project_upvotes BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revised_revision_project_comments_insert AFTER INSERT ON project_comments BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revised_revision_project_comments_update AFTER UPDATE ON project_comments BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER revised_revision_project_comments_delete AFTER DELETE ON project_comments BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
