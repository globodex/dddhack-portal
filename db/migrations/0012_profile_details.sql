CREATE TABLE `profile_details` (
	`user_id` text PRIMARY KEY NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`best_description` text DEFAULT '' NOT NULL,
	`organization` text DEFAULT '' NOT NULL,
	`openai_org_id` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
