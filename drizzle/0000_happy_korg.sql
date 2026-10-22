CREATE TABLE `astra_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`version_id` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`report` text,
	`error` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`version_id`) REFERENCES `submission_versions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "astra_jobs_check_1" CHECK(state IN ('pending','running','needs_review','failed_retryable','finalized')),
	CONSTRAINT "astra_jobs_check_2" CHECK(report IS NULL OR json_valid(report))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `astra_jobs_version_id_unique` ON `astra_jobs` (`version_id`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_id` text NOT NULL,
	`detail` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "audit_logs_check_1" CHECK(json_valid(detail))
);
--> statement-breakpoint
CREATE INDEX `audit_time` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `check_ins` (
	`user_id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `credit_allocations` (
	`inventory_id` text PRIMARY KEY NOT NULL,
	`type_id` text NOT NULL,
	`user_id` text NOT NULL,
	`assigned_at` text NOT NULL,
	FOREIGN KEY (`inventory_id`) REFERENCES `credit_inventory`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`type_id`) REFERENCES `credit_types`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credit_allocations_type_id_user_id_unique` ON `credit_allocations` (`type_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `credit_inventory` (
	`id` text PRIMARY KEY NOT NULL,
	`type_id` text NOT NULL,
	`ciphertext` text NOT NULL,
	`fingerprint` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`type_id`) REFERENCES `credit_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credit_inventory_type_id_fingerprint_unique` ON `credit_inventory` (`type_id`,`fingerprint`);--> statement-breakpoint
CREATE TABLE `credit_types` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`instructions` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "credit_types_check_1" CHECK(active IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credit_types_name_unique` ON `credit_types` (`name`);--> statement-breakpoint
CREATE TABLE `event_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`policy` text NOT NULL,
	`active` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "event_settings_check_1" CHECK(id=1),
	CONSTRAINT "event_settings_check_2" CHECK(json_valid(policy)),
	CONSTRAINT "event_settings_check_3" CHECK(active IN (0,1))
);
--> statement-breakpoint
CREATE TABLE `feedback` (
	`author_id` text NOT NULL,
	`team_id` text NOT NULL,
	`text` text NOT NULL,
	`valid` integer DEFAULT 1 NOT NULL,
	`moderation_reason` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`author_id`, `team_id`),
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "feedback_check_1" CHECK(valid IN (0,1))
);
--> statement-breakpoint
CREATE TABLE `human_scores` (
	`judge_id` text NOT NULL,
	`team_id` text NOT NULL,
	`rating` real NOT NULL,
	`notes` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`judge_id`, `team_id`),
	FOREIGN KEY (`judge_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "human_scores_check_1" CHECK(rating BETWEEN 0 AND 10)
);
--> statement-breakpoint
CREATE TABLE `idea_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "idea_revisions_check_1" CHECK(json_valid(snapshot))
);
--> statement-breakpoint
CREATE TABLE `ideas` (
	`team_id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`core` text NOT NULL,
	`description` text NOT NULL,
	`hash` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `import_previews` (
	`actor_id` text NOT NULL,
	`digest` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`actor_id`, `digest`),
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `judge_assignments` (
	`judge_id` text NOT NULL,
	`team_id` text NOT NULL,
	PRIMARY KEY(`judge_id`, `team_id`),
	FOREIGN KEY (`judge_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `memberships` (
	`user_id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`joined_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `memberships_team` ON `memberships` (`team_id`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`socials` text DEFAULT '[]' NOT NULL,
	`gender` text DEFAULT 'prefer-not-to-say' NOT NULL,
	`gender_description` text DEFAULT '' NOT NULL,
	`public` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "profiles_check_1" CHECK(json_valid(socials)),
	CONSTRAINT "profiles_check_2" CHECK(gender IN ('woman','man','non-binary','self-described','prefer-not-to-say')),
	CONSTRAINT "profiles_check_3" CHECK(public IN (0,1))
);
--> statement-breakpoint
CREATE TABLE `registrations` (
	`email` text COLLATE NOCASE PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`luma_confirmed` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "registrations_check_1" CHECK(status IN ('pending','approved','rejected','cancelled')),
	CONSTRAINT "registrations_check_2" CHECK(luma_confirmed IN (0,1))
);
--> statement-breakpoint
CREATE TABLE `request_buckets` (
	`actor_id` text NOT NULL,
	`window` integer NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`actor_id`, `window`),
	CONSTRAINT "request_buckets_check_1" CHECK(count<=120)
);
--> statement-breakpoint
CREATE TABLE `result_publication` (
	`id` integer PRIMARY KEY NOT NULL,
	`snapshot_id` text NOT NULL,
	`published_at` text NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `result_snapshots`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "result_publication_check_1" CHECK(id=1)
);
--> statement-breakpoint
CREATE TABLE `result_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`policy_version` integer NOT NULL,
	`source_revision` integer NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`frozen_by` text NOT NULL,
	FOREIGN KEY (`frozen_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "result_snapshots_check_1" CHECK(json_valid(payload))
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`team_id` text PRIMARY KEY NOT NULL,
	`version_id` text NOT NULL,
	`eligibility` text NOT NULL,
	`astra` real,
	`codex` real,
	`diversity` real,
	`false_claims` integer DEFAULT 0 NOT NULL,
	`evidence` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `submission_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "reviews_check_1" CHECK(eligibility IN ('eligible','ineligible','needs_review')),
	CONSTRAINT "reviews_check_2" CHECK(astra BETWEEN 0 AND 30),
	CONSTRAINT "reviews_check_3" CHECK(codex BETWEEN 0 AND 5),
	CONSTRAINT "reviews_check_4" CHECK(diversity BETWEEN 0 AND 10),
	CONSTRAINT "reviews_check_5" CHECK(false_claims BETWEEN 0 AND 2)
);
--> statement-breakpoint
CREATE TABLE `scoring_revision` (
	`id` integer PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "scoring_revision_check_1" CHECK(id=1)
);
--> statement-breakpoint
CREATE TABLE `submission_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`attempt` integer NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "submission_versions_check_1" CHECK(attempt BETWEEN 1 AND 3),
	CONSTRAINT "submission_versions_check_2" CHECK(json_valid(payload))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submission_versions_team_id_attempt_unique` ON `submission_versions` (`team_id`,`attempt`);--> statement-breakpoint
CREATE TABLE `team_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "team_actions_check_1" CHECK(kind IN ('invite','request')),
	CONSTRAINT "team_actions_check_2" CHECK(status IN ('pending','accepted','declined'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_actions_team_id_user_id_kind_unique` ON `team_actions` (`team_id`,`user_id`,`kind`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text COLLATE NOCASE NOT NULL,
	`leader_id` text NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`leader_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teams_name_unique` ON `teams` (`name`);--> statement-breakpoint
CREATE TABLE `tie_resolutions` (
	`group_hash` text NOT NULL,
	`team_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	PRIMARY KEY(`group_hash`, `team_id`),
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tie_resolutions_check_1" CHECK(ordinal>0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tie_resolutions_group_hash_ordinal_unique` ON `tie_resolutions` (`group_hash`,`ordinal`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text COLLATE NOCASE NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'participant' NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "users_check_1" CHECK(role IN ('participant','admin','judge'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `votes` (
	`voter_id` text NOT NULL,
	`team_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`voter_id`, `team_id`),
	FOREIGN KEY (`voter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
