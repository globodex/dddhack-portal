CREATE TABLE `automatic_absences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`reconciled_at` text NOT NULL,
	`cutoff` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE `record_removals` (
	`kind` text NOT NULL,
	`target_id` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`reason` text NOT NULL,
	`actor_id` text NOT NULL,
	`updated_at` text NOT NULL,
	`snapshot` text DEFAULT '{}' NOT NULL,
	PRIMARY KEY(`kind`, `target_id`),
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "removal_kind" CHECK("record_removals"."kind" IN ('participant','team','project','submission')),
	CONSTRAINT "removal_active" CHECK("record_removals"."active" IN (0,1))
);

CREATE TABLE `roster_prefills` (
	`email` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`imported_at` text NOT NULL,
	FOREIGN KEY (`email`) REFERENCES `luma_roster`(`email`) ON UPDATE no action ON DELETE no action
);

CREATE TRIGGER removed_team_membership BEFORE INSERT ON memberships WHEN EXISTS(SELECT 1 FROM record_removals r WHERE r.active=1 AND ((r.kind='team' AND r.target_id=NEW.team_id) OR (r.kind='participant' AND r.target_id=NEW.user_id))) BEGIN SELECT RAISE(ABORT,'RECORD_REMOVED'); END;

CREATE TRIGGER removed_team_request BEFORE INSERT ON team_actions WHEN EXISTS(SELECT 1 FROM record_removals r WHERE r.active=1 AND ((r.kind='team' AND r.target_id=NEW.team_id) OR (r.kind='participant' AND r.target_id=NEW.user_id))) BEGIN SELECT RAISE(ABORT,'RECORD_REMOVED'); END;

CREATE TRIGGER removed_project_submission BEFORE INSERT ON submission_versions WHEN EXISTS(SELECT 1 FROM teams t JOIN record_removals r ON r.active=1 WHERE t.id=NEW.team_id AND ((r.kind='team' AND r.target_id=t.id) OR (r.kind='participant' AND r.target_id=t.leader_id) OR (r.kind='project' AND r.target_id IN(SELECT id FROM projects WHERE team_id=t.id)))) BEGIN SELECT RAISE(ABORT,'RECORD_REMOVED'); END;

CREATE TRIGGER removed_project_draft BEFORE UPDATE OF draft ON projects WHEN EXISTS(SELECT 1 FROM record_removals r WHERE r.active=1 AND r.kind='project' AND r.target_id=NEW.id) BEGIN SELECT RAISE(ABORT,'RECORD_REMOVED'); END;

CREATE TRIGGER removed_project_upvote BEFORE INSERT ON project_upvotes WHEN EXISTS(SELECT 1 FROM record_removals r WHERE r.active=1 AND ((r.kind='participant' AND r.target_id=NEW.user_id) OR (r.kind='project' AND r.target_id=NEW.project_id) OR (r.kind='submission' AND r.target_id=(SELECT published_version_id FROM projects WHERE id=NEW.project_id)))) BEGIN SELECT RAISE(ABORT,'RECORD_REMOVED'); END;

CREATE TRIGGER removed_project_comment BEFORE INSERT ON project_comments WHEN EXISTS(SELECT 1 FROM record_removals r WHERE r.active=1 AND ((r.kind='participant' AND r.target_id=NEW.author_id) OR (r.kind='project' AND r.target_id=NEW.project_id) OR (r.kind='submission' AND r.target_id=(SELECT published_version_id FROM projects WHERE id=NEW.project_id)))) BEGIN SELECT RAISE(ABORT,'RECORD_REMOVED'); END;

CREATE TRIGGER removed_credit_recipient BEFORE INSERT ON credit_allocations WHEN EXISTS(SELECT 1 FROM record_removals r WHERE r.kind='participant' AND r.target_id=NEW.user_id AND r.active=1) BEGIN SELECT RAISE(ABORT,'PARTICIPANT_REMOVED'); END;

CREATE TRIGGER automatic_absences_immutable_update BEFORE UPDATE ON automatic_absences BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;

CREATE TRIGGER automatic_absences_immutable_delete BEFORE DELETE ON automatic_absences BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
