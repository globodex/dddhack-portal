CREATE TABLE `score_releases` (
	`id` text PRIMARY KEY NOT NULL,
	`stage` text NOT NULL,
	`source_id` text NOT NULL,
	`payload` text NOT NULL,
	`criteria` text,
	`created_at` text NOT NULL,
	`actor_id` text NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "score_release_stage" CHECK("score_releases"."stage" IN ('ai','final')),
	CONSTRAINT "score_release_json" CHECK(json_valid("score_releases"."payload"))
);

CREATE UNIQUE INDEX `score_releases_stage_unique` ON `score_releases` (`stage`);
CREATE TABLE `winner_reveals` (
	`release_id` text NOT NULL,
	`position` integer NOT NULL,
	`project_id` text NOT NULL,
	`created_at` text NOT NULL,
	`actor_id` text NOT NULL,
	PRIMARY KEY(`release_id`, `position`),
	FOREIGN KEY (`release_id`) REFERENCES `score_releases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "winner_position" CHECK("winner_reveals"."position" BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX `winner_reveals_release_id_project_id_unique` ON `winner_reveals` (`release_id`,`project_id`);
ALTER TABLE `evaluation_runs` ADD `score` real;
ALTER TABLE `evaluation_runs` ADD `provenance` text;

CREATE TRIGGER score_releases_immutable_update BEFORE UPDATE ON score_releases BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;


CREATE TRIGGER score_releases_immutable_delete BEFORE DELETE ON score_releases BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;


CREATE TRIGGER winner_reveals_immutable_update BEFORE UPDATE ON winner_reveals BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;


CREATE TRIGGER winner_reveals_immutable_delete BEFORE DELETE ON winner_reveals BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;


CREATE TRIGGER evaluation_runs_revision_insert AFTER INSERT ON evaluation_runs BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;


CREATE TRIGGER evaluation_runs_revision_update AFTER UPDATE ON evaluation_runs BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;


CREATE TRIGGER evaluation_runs_revision_delete AFTER DELETE ON evaluation_runs BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
