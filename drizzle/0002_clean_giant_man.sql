CREATE TABLE `evaluation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`version_id` text NOT NULL,
	`config_key` text NOT NULL,
	`state` text NOT NULL,
	`report` text,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `submission_versions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "evaluation_run_state" CHECK("evaluation_runs"."state" IN ('queued','running','completed','failed','stale')),
	CONSTRAINT "evaluation_run_report" CHECK("evaluation_runs"."report" IS NULL OR json_valid("evaluation_runs"."report"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `evaluation_single_active` ON `evaluation_runs` (`version_id`,`config_key`) WHERE "evaluation_runs"."state" IN ('queued','running');--> statement-breakpoint
CREATE TABLE `participant_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`skills` text DEFAULT '' NOT NULL,
	`completed_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `portal_roles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`granted_by` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`granted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "portal_role_valid" CHECK("portal_roles"."role" IN ('participant','volunteer','mentor','judge','admin'))
);
--> statement-breakpoint
CREATE TABLE `project_assignments` (
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	PRIMARY KEY(`project_id`, `user_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "project_assignment_kind" CHECK("project_assignments"."kind" IN ('judge','mentor'))
);
--> statement-breakpoint
CREATE TABLE `project_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `project_comments_project` ON `project_comments` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `project_review_history` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`version_id` text NOT NULL,
	`author_id` text NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`rating` real,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `submission_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "project_review_kind" CHECK("project_review_history"."kind" IN ('judge','mentor','admin')),
	CONSTRAINT "project_review_rating" CHECK("project_review_history"."rating" BETWEEN 0 AND 10)
);
--> statement-breakpoint
CREATE TABLE `project_upvotes` (
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`project_id`, `user_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`slug` text NOT NULL,
	`draft` text DEFAULT '{}' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`published_version_id` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`published_version_id`) REFERENCES `submission_versions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "project_draft_json" CHECK(json_valid("projects"."draft"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_team_id_unique` ON `projects` (`team_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `projects_slug_unique` ON `projects` (`slug`);--> statement-breakpoint
CREATE TABLE `team_styles` (
	`team_id` text PRIMARY KEY NOT NULL,
	`avatar` text DEFAULT 'orbit' NOT NULL,
	`palette` text DEFAULT 'forest' NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE TRIGGER project_review_immutable BEFORE UPDATE ON project_review_history BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER project_review_no_delete BEFORE DELETE ON project_review_history BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER project_publication_version BEFORE UPDATE OF published_version_id ON projects WHEN NEW.published_version_id IS NOT NULL BEGIN SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM submission_versions WHERE id=NEW.published_version_id AND team_id=NEW.team_id) THEN RAISE(ABORT,'PROJECT_VERSION_MISMATCH') END; END;
--> statement-breakpoint
DROP TRIGGER membership_guard;
--> statement-breakpoint
CREATE TRIGGER membership_guard BEFORE INSERT ON memberships BEGIN
 SELECT CASE WHEN (SELECT count(*) FROM memberships WHERE team_id=NEW.team_id)>=5 THEN RAISE(ABORT,'TEAM_FULL') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users u LEFT JOIN registrations r ON r.email=u.email WHERE u.id=NEW.user_id AND COALESCE(r.status,'pending') NOT IN ('rejected','cancelled')) THEN RAISE(ABORT,'REGISTRATION_REQUIRED') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM event_settings WHERE id=1 AND active=1 AND NEW.joined_at >= json_extract(policy,'$.membershipFreeze')) THEN RAISE(ABORT,'MEMBERSHIP_FROZEN') END;
END;
