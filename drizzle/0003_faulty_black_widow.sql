CREATE TABLE `event_content` (
	`id` integer PRIMARY KEY NOT NULL,
	`draft` text NOT NULL,
	`published` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `event_content_history` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`revision` integer NOT NULL,
	`snapshot` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "content_scope" CHECK("event_content_history"."scope" IN ('public','private'))
);
--> statement-breakpoint
CREATE TABLE `private_venue` (
	`id` integer PRIMARY KEY NOT NULL,
	`draft` text NOT NULL,
	`published` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `private_venue_managers` (
	`user_id` text PRIMARY KEY NOT NULL,
	`granted_by` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`granted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
