CREATE TABLE `engagement_controls` (
	`id` integer PRIMARY KEY NOT NULL,
	`voting_paused` integer DEFAULT 0 NOT NULL,
	`feedback_paused` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`actor_id` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "engagement_singleton" CHECK("engagement_controls"."id"=1),
	CONSTRAINT "engagement_vote_flag" CHECK("engagement_controls"."voting_paused" IN (0,1)),
	CONSTRAINT "engagement_feedback_flag" CHECK("engagement_controls"."feedback_paused" IN (0,1))
);

CREATE TRIGGER community_voting_paused BEFORE INSERT ON project_upvotes WHEN (SELECT voting_paused FROM engagement_controls WHERE id=1)=1 BEGIN SELECT RAISE(ABORT,'ENGAGEMENT_PAUSED'); END;

CREATE TRIGGER community_feedback_paused BEFORE INSERT ON project_comments WHEN (SELECT feedback_paused FROM engagement_controls WHERE id=1)=1 BEGIN SELECT RAISE(ABORT,'ENGAGEMENT_PAUSED'); END;

CREATE TRIGGER legacy_voting_paused BEFORE INSERT ON votes WHEN (SELECT voting_paused FROM engagement_controls WHERE id=1)=1 BEGIN SELECT RAISE(ABORT,'ENGAGEMENT_PAUSED'); END;

CREATE TRIGGER legacy_feedback_paused BEFORE INSERT ON feedback WHEN (SELECT feedback_paused FROM engagement_controls WHERE id=1)=1 BEGIN SELECT RAISE(ABORT,'ENGAGEMENT_PAUSED'); END;

CREATE TRIGGER community_feedback_length BEFORE INSERT ON project_comments WHEN length(trim(NEW.body))<30 BEGIN SELECT RAISE(ABORT,'FEEDBACK_TOO_SHORT'); END;
