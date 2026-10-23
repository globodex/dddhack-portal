CREATE TABLE `event_policy_history` (
	`version` integer PRIMARY KEY NOT NULL,
	`policy` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` text NOT NULL,
	`reason` text NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE TRIGGER event_policy_history_no_update BEFORE UPDATE ON event_policy_history BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER event_policy_history_no_delete BEFORE DELETE ON event_policy_history BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;

--> statement-breakpoint
CREATE TRIGGER whole_idea_lock BEFORE UPDATE ON ideas WHEN NEW.updated_at >= (SELECT json_extract(policy,'$.ideaLock') FROM event_settings WHERE id=1) BEGIN SELECT RAISE(ABORT,'IDEA_LOCKED'); END;
