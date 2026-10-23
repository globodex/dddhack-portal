CREATE TABLE `luma_roster` (
	`email` text PRIMARY KEY NOT NULL,
	`imported_by` text NOT NULL,
	`imported_at` text NOT NULL,
	FOREIGN KEY (`imported_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE TRIGGER luma_roster_no_update BEFORE UPDATE ON luma_roster BEGIN SELECT RAISE(ABORT,'ROSTER_ADD_ONLY'); END;
--> statement-breakpoint
CREATE TRIGGER luma_roster_no_delete BEFORE DELETE ON luma_roster BEGIN SELECT RAISE(ABORT,'ROSTER_ADD_ONLY'); END;
