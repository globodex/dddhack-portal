CREATE TABLE `project_feedback_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`comment_id` text NOT NULL,
	`version_id` text NOT NULL,
	`rule_version` integer NOT NULL,
	`qualified` integer NOT NULL,
	`body_hash` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`comment_id`) REFERENCES `project_comments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `submission_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "feedback_review_qualified" CHECK("project_feedback_reviews"."qualified" IN (0,1))
);

CREATE INDEX `feedback_review_lookup` ON `project_feedback_reviews` (`comment_id`,`version_id`,`rule_version`);

CREATE TRIGGER submissions_operational_scope BEFORE INSERT ON submission_versions WHEN NOT EXISTS(SELECT 1 FROM event_settings WHERE id=1 AND active=1 AND (json_type(policy,'$.operationScopes') IS NULL OR json_type(policy,'$.operationScopes')='null' OR EXISTS(SELECT 1 FROM json_each(policy,'$.operationScopes') WHERE value='submissions'))) BEGIN SELECT RAISE(ABORT,'OPERATION_NOT_ENABLED'); END;


CREATE TRIGGER checkin_operational_scope BEFORE INSERT ON check_ins WHEN NOT EXISTS(SELECT 1 FROM event_settings WHERE id=1 AND active=1 AND (json_type(policy,'$.operationScopes') IS NULL OR json_type(policy,'$.operationScopes')='null' OR EXISTS(SELECT 1 FROM json_each(policy,'$.operationScopes') WHERE value='checkin'))) BEGIN SELECT RAISE(ABORT,'OPERATION_NOT_ENABLED'); END;


CREATE TRIGGER feedback_review_immutable_update BEFORE UPDATE ON project_feedback_reviews BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;


CREATE TRIGGER feedback_review_immutable_delete BEFORE DELETE ON project_feedback_reviews BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;


CREATE TRIGGER feedback_review_frozen BEFORE INSERT ON project_feedback_reviews WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;


CREATE TRIGGER qualification_revision_project_feedback_reviews_insert AFTER INSERT ON project_feedback_reviews BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;


CREATE TRIGGER qualification_revision_check_ins_insert AFTER INSERT ON check_ins BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;


CREATE TRIGGER qualification_revision_check_ins_update AFTER UPDATE ON check_ins BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;


CREATE TRIGGER qualification_revision_check_ins_delete AFTER DELETE ON check_ins BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
