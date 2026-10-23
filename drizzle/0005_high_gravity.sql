CREATE TABLE `project_eligibility` (
	`project_id` text PRIMARY KEY NOT NULL,
	`version_id` text NOT NULL,
	`status` text NOT NULL,
	`reason` text NOT NULL,
	`decided_by` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `submission_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "project_eligibility_status" CHECK("project_eligibility"."status" IN ('eligible','ineligible','needs_review'))
);
