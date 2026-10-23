CREATE TABLE `project_commit_receipts` (
	`team_id` text NOT NULL,
	`request_key` text NOT NULL,
	`project_id` text NOT NULL,
	`version_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`team_id`, `request_key`),
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `submission_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_commit_receipts_version_id_unique` ON `project_commit_receipts` (`version_id`);--> statement-breakpoint
CREATE TABLE `team_locks` (
	`team_id` text PRIMARY KEY NOT NULL,
	`locked_by` text NOT NULL,
	`locked_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`locked_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `credit_allocations` ADD `recipient_email` text;
--> statement-breakpoint
CREATE TRIGGER locked_memberships_insert BEFORE INSERT ON memberships WHEN EXISTS(SELECT 1 FROM team_locks WHERE team_id=NEW.team_id) BEGIN SELECT RAISE(ABORT,'TEAM_LOCKED'); END;

--> statement-breakpoint
CREATE TRIGGER locked_memberships_update BEFORE UPDATE ON memberships WHEN EXISTS(SELECT 1 FROM team_locks WHERE team_id=NEW.team_id OR team_id=OLD.team_id) BEGIN SELECT RAISE(ABORT,'TEAM_LOCKED'); END;

--> statement-breakpoint
CREATE TRIGGER locked_memberships_delete BEFORE DELETE ON memberships WHEN EXISTS(SELECT 1 FROM team_locks WHERE team_id=OLD.team_id) BEGIN SELECT RAISE(ABORT,'TEAM_LOCKED'); END;

--> statement-breakpoint
CREATE TRIGGER locked_team_styles_insert BEFORE INSERT ON team_styles WHEN EXISTS(SELECT 1 FROM team_locks WHERE team_id=NEW.team_id) BEGIN SELECT RAISE(ABORT,'TEAM_LOCKED'); END;

--> statement-breakpoint
CREATE TRIGGER locked_team_styles_update BEFORE UPDATE ON team_styles WHEN EXISTS(SELECT 1 FROM team_locks WHERE team_id=NEW.team_id OR team_id=OLD.team_id) BEGIN SELECT RAISE(ABORT,'TEAM_LOCKED'); END;

--> statement-breakpoint
CREATE TRIGGER locked_team_styles_delete BEFORE DELETE ON team_styles WHEN EXISTS(SELECT 1 FROM team_locks WHERE team_id=OLD.team_id) BEGIN SELECT RAISE(ABORT,'TEAM_LOCKED'); END;

--> statement-breakpoint
CREATE TRIGGER locked_ideas_insert BEFORE INSERT ON ideas WHEN EXISTS(SELECT 1 FROM team_locks WHERE team_id=NEW.team_id) BEGIN SELECT RAISE(ABORT,'TEAM_LOCKED'); END;

--> statement-breakpoint
CREATE TRIGGER locked_ideas_update BEFORE UPDATE ON ideas WHEN EXISTS(SELECT 1 FROM team_locks WHERE team_id=NEW.team_id OR team_id=OLD.team_id) BEGIN SELECT RAISE(ABORT,'TEAM_LOCKED'); END;

--> statement-breakpoint
CREATE TRIGGER locked_ideas_delete BEFORE DELETE ON ideas WHEN EXISTS(SELECT 1 FROM team_locks WHERE team_id=OLD.team_id) BEGIN SELECT RAISE(ABORT,'TEAM_LOCKED'); END;

--> statement-breakpoint
CREATE TRIGGER locked_team_actions_insert BEFORE INSERT ON team_actions WHEN EXISTS(SELECT 1 FROM team_locks WHERE team_id=NEW.team_id) BEGIN SELECT RAISE(ABORT,'TEAM_LOCKED'); END;

--> statement-breakpoint
CREATE TRIGGER locked_team_actions_update BEFORE UPDATE ON team_actions WHEN EXISTS(SELECT 1 FROM team_locks WHERE team_id=NEW.team_id OR team_id=OLD.team_id) BEGIN SELECT RAISE(ABORT,'TEAM_LOCKED'); END;

--> statement-breakpoint
CREATE TRIGGER locked_team_actions_delete BEFORE DELETE ON team_actions WHEN EXISTS(SELECT 1 FROM team_locks WHERE team_id=OLD.team_id) BEGIN SELECT RAISE(ABORT,'TEAM_LOCKED'); END;

--> statement-breakpoint
CREATE TRIGGER locked_teams_insert BEFORE INSERT ON teams WHEN EXISTS(SELECT 1 FROM team_locks WHERE team_id=NEW.id) BEGIN SELECT RAISE(ABORT,'TEAM_LOCKED'); END;

--> statement-breakpoint
CREATE TRIGGER locked_teams_update BEFORE UPDATE ON teams WHEN EXISTS(SELECT 1 FROM team_locks WHERE team_id=NEW.id OR team_id=OLD.id) BEGIN SELECT RAISE(ABORT,'TEAM_LOCKED'); END;

--> statement-breakpoint
CREATE TRIGGER locked_teams_delete BEFORE DELETE ON teams WHEN EXISTS(SELECT 1 FROM team_locks WHERE team_id=OLD.id) BEGIN SELECT RAISE(ABORT,'TEAM_LOCKED'); END;

--> statement-breakpoint
CREATE TRIGGER team_locks_immutable_update BEFORE UPDATE ON team_locks BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER team_locks_immutable_delete BEFORE DELETE ON team_locks BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER project_commit_receipts_immutable_update BEFORE UPDATE ON project_commit_receipts BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER project_commit_receipts_immutable_delete BEFORE DELETE ON project_commit_receipts BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER complete_team_lock BEFORE INSERT ON team_locks BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM teams WHERE id=NEW.team_id AND leader_id=NEW.locked_by) THEN RAISE(ABORT,'LEADER_REQUIRED') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM ideas WHERE team_id=NEW.team_id AND length(trim(title))>0 AND length(trim(core))>0) THEN RAISE(ABORT,'TEAM_IDEA_REQUIRED') END;
 SELECT CASE WHEN (SELECT count(*) FROM memberships WHERE team_id=NEW.team_id) NOT BETWEEN 1 AND 5 OR EXISTS(SELECT 1 FROM memberships m LEFT JOIN participant_profiles p ON p.user_id=m.user_id WHERE m.team_id=NEW.team_id AND (p.completed_at IS NULL OR p.gender_confirmed<>1)) THEN RAISE(ABORT,'MEMBER_PROFILE_REQUIRED') END;
END;
--> statement-breakpoint
CREATE TRIGGER submission_team_checkin BEFORE INSERT ON submission_versions WHEN NOT EXISTS(SELECT 1 FROM memberships m JOIN check_ins c ON c.user_id=m.user_id WHERE m.team_id=NEW.team_id) BEGIN SELECT RAISE(ABORT,'TEAM_CHECKIN_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER draft_team_checkin_insert BEFORE INSERT ON projects WHEN NOT EXISTS(SELECT 1 FROM memberships m JOIN check_ins c ON c.user_id=m.user_id WHERE m.team_id=NEW.team_id) BEGIN SELECT RAISE(ABORT,'TEAM_CHECKIN_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER draft_team_checkin_update BEFORE UPDATE OF draft ON projects WHEN NOT EXISTS(SELECT 1 FROM memberships m JOIN check_ins c ON c.user_id=m.user_id WHERE m.team_id=NEW.team_id) BEGIN SELECT RAISE(ABORT,'TEAM_CHECKIN_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER final_project_insert BEFORE INSERT ON projects WHEN (SELECT count(*) FROM submission_versions WHERE team_id=NEW.team_id)>=3 BEGIN SELECT RAISE(ABORT,'PROJECT_LOCKED_AFTER_THIRD_SUBMISSION'); END;
--> statement-breakpoint
CREATE TRIGGER final_project_delete BEFORE DELETE ON projects WHEN (SELECT count(*) FROM submission_versions WHERE team_id=OLD.team_id)>=3 BEGIN SELECT RAISE(ABORT,'PROJECT_LOCKED_AFTER_THIRD_SUBMISSION'); END;
--> statement-breakpoint
CREATE TRIGGER final_project_update BEFORE UPDATE ON projects WHEN (SELECT count(*) FROM submission_versions WHERE team_id=OLD.team_id)>=3 AND NOT(NEW.id=OLD.id AND NEW.team_id=OLD.team_id AND NEW.slug=OLD.slug AND NEW.draft=OLD.draft AND NEW.revision=OLD.revision AND NEW.updated_at=OLD.updated_at AND NEW.published_version_id=(SELECT id FROM submission_versions WHERE team_id=OLD.team_id AND attempt=3) AND OLD.published_version_id IS NOT NEW.published_version_id) BEGIN SELECT RAISE(ABORT,'PROJECT_LOCKED_AFTER_THIRD_SUBMISSION'); END;
--> statement-breakpoint
DROP TRIGGER checkin_guard;
--> statement-breakpoint
CREATE TRIGGER checkin_guard BEFORE INSERT ON check_ins BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users u JOIN registrations r ON r.email=u.email WHERE u.id=NEW.user_id AND r.status='approved') THEN RAISE(ABORT,'APPROVAL_REQUIRED') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM memberships own WHERE own.user_id=NEW.user_id) OR EXISTS(SELECT 1 FROM memberships own JOIN memberships m ON m.team_id=own.team_id JOIN users u ON u.id=m.user_id LEFT JOIN registrations r ON r.email=u.email WHERE own.user_id=NEW.user_id AND COALESCE(r.status,'pending')<>'approved') THEN RAISE(ABORT,'PORTAL_GOING_REQUIRED') END;
END;
