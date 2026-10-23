CREATE TABLE `eligibility_history` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`version_id` text NOT NULL,
	`status` text NOT NULL,
	`reason` text NOT NULL,
	`evidence` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `submission_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `manual_checkins` (
	`user_id` text NOT NULL,
	`verified_email` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `verified_email`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `participant_status_overrides` (
	`user_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`reason` text NOT NULL,
	`actor_id` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "person_override_status" CHECK("participant_status_overrides"."status" IN ('Registered','Going','Checked in','Absent'))
);
--> statement-breakpoint
CREATE TABLE `repository_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`version_id` text NOT NULL,
	`commit_sha` text NOT NULL,
	`status` text NOT NULL,
	`evidence` text NOT NULL,
	`reason` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `submission_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `team_status_overrides` (
	`team_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`reason` text NOT NULL,
	`rule_reference` text,
	`evidence` text,
	`actor_id` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "team_override_status" CHECK("team_status_overrides"."status" IN ('Forming','Locked','Not submitted','Submitted'))
);

--> statement-breakpoint
DROP TRIGGER submission_team_checkin;
--> statement-breakpoint
CREATE TRIGGER submission_team_checkin BEFORE INSERT ON submission_versions WHEN NOT EXISTS(SELECT 1 FROM memberships m JOIN users au ON au.id=m.user_id JOIN registrations ar ON ar.email=au.email AND ar.status='approved' WHERE m.team_id=NEW.team_id AND COALESCE((SELECT status FROM participant_status_overrides WHERE user_id=au.id),'Checked in')='Checked in' AND (EXISTS(SELECT 1 FROM check_ins c WHERE c.user_id=au.id) OR EXISTS(SELECT 1 FROM manual_checkins mc WHERE mc.user_id=au.id AND mc.verified_email=lower(au.email)))) BEGIN SELECT RAISE(ABORT,'TEAM_CHECKIN_REQUIRED'); END;
--> statement-breakpoint
DROP TRIGGER draft_team_checkin_insert;
--> statement-breakpoint
CREATE TRIGGER draft_team_checkin_insert BEFORE INSERT ON projects WHEN NOT EXISTS(SELECT 1 FROM memberships m JOIN users au ON au.id=m.user_id JOIN registrations ar ON ar.email=au.email AND ar.status='approved' WHERE m.team_id=NEW.team_id AND COALESCE((SELECT status FROM participant_status_overrides WHERE user_id=au.id),'Checked in')='Checked in' AND (EXISTS(SELECT 1 FROM check_ins c WHERE c.user_id=au.id) OR EXISTS(SELECT 1 FROM manual_checkins mc WHERE mc.user_id=au.id AND mc.verified_email=lower(au.email)))) BEGIN SELECT RAISE(ABORT,'TEAM_CHECKIN_REQUIRED'); END;
--> statement-breakpoint
DROP TRIGGER draft_team_checkin_update;
--> statement-breakpoint
CREATE TRIGGER draft_team_checkin_update BEFORE UPDATE OF draft ON projects WHEN NOT EXISTS(SELECT 1 FROM memberships m JOIN users au ON au.id=m.user_id JOIN registrations ar ON ar.email=au.email AND ar.status='approved' WHERE m.team_id=NEW.team_id AND COALESCE((SELECT status FROM participant_status_overrides WHERE user_id=au.id),'Checked in')='Checked in' AND (EXISTS(SELECT 1 FROM check_ins c WHERE c.user_id=au.id) OR EXISTS(SELECT 1 FROM manual_checkins mc WHERE mc.user_id=au.id AND mc.verified_email=lower(au.email)))) BEGIN SELECT RAISE(ABORT,'TEAM_CHECKIN_REQUIRED'); END;
--> statement-breakpoint
DROP TRIGGER submission_guard;
--> statement-breakpoint
CREATE TRIGGER submission_guard BEFORE INSERT ON submission_versions BEGIN
 SELECT CASE WHEN (SELECT active FROM event_settings WHERE id=1)<>1 THEN RAISE(ABORT,'EVENT_DRAFT') END;
 SELECT CASE WHEN (SELECT json_extract(policy,'$.submissionClose') FROM event_settings WHERE id=1) IS NULL OR NEW.created_at < (SELECT json_extract(policy,'$.submissionOpen') FROM event_settings WHERE id=1) OR NEW.created_at >= (SELECT json_extract(policy,'$.submissionClose') FROM event_settings WHERE id=1) THEN RAISE(ABORT,'SUBMISSIONS_CLOSED') END;
END;
--> statement-breakpoint
DROP TRIGGER checkin_guard;
--> statement-breakpoint
CREATE TRIGGER checkin_guard BEFORE INSERT ON check_ins WHEN NOT EXISTS(SELECT 1 FROM users u JOIN registrations r ON r.email=u.email WHERE u.id=NEW.user_id AND r.status='approved') BEGIN SELECT RAISE(ABORT,'PORTAL_GOING_REQUIRED'); END;
--> statement-breakpoint
CREATE TRIGGER manual_checkins_immutable_update BEFORE UPDATE ON manual_checkins BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER manual_checkins_immutable_delete BEFORE DELETE ON manual_checkins BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER repository_evidence_immutable_update BEFORE UPDATE ON repository_evidence BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER repository_evidence_immutable_delete BEFORE DELETE ON repository_evidence BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER eligibility_history_immutable_update BEFORE UPDATE ON eligibility_history BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER eligibility_history_immutable_delete BEFORE DELETE ON eligibility_history BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER status_revision_manual_checkins_insert AFTER INSERT ON manual_checkins BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER status_revision_manual_checkins_update AFTER UPDATE ON manual_checkins BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER status_revision_manual_checkins_delete AFTER DELETE ON manual_checkins BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER status_revision_participant_status_overrides_insert AFTER INSERT ON participant_status_overrides BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER status_revision_participant_status_overrides_update AFTER UPDATE ON participant_status_overrides BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER status_revision_participant_status_overrides_delete AFTER DELETE ON participant_status_overrides BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER status_revision_team_status_overrides_insert AFTER INSERT ON team_status_overrides BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER status_revision_team_status_overrides_update AFTER UPDATE ON team_status_overrides BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER status_revision_team_status_overrides_delete AFTER DELETE ON team_status_overrides BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER status_revision_eligibility_history_insert AFTER INSERT ON eligibility_history BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER status_revision_eligibility_history_update AFTER UPDATE ON eligibility_history BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER status_revision_eligibility_history_delete AFTER DELETE ON eligibility_history BEGIN UPDATE scoring_revision SET version=version+1 WHERE id=1; END;
--> statement-breakpoint
CREATE TRIGGER repository_evidence_freeze BEFORE INSERT ON repository_evidence WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER eligibility_history_freeze BEFORE INSERT ON eligibility_history WHEN EXISTS(SELECT 1 FROM result_snapshots) BEGIN SELECT RAISE(ABORT,'RESULTS_FROZEN'); END;
--> statement-breakpoint
CREATE TRIGGER allocation_recipient_insert BEFORE INSERT ON credit_allocations WHEN NEW.recipient_email IS NULL OR lower(NEW.recipient_email)<>(SELECT lower(email) FROM users WHERE id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'CREDIT_RECIPIENT_MISMATCH'); END;

--> statement-breakpoint
DROP TRIGGER allocation_guard;
--> statement-breakpoint
CREATE TRIGGER allocation_guard BEFORE INSERT ON credit_allocations BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM credit_inventory WHERE id=NEW.inventory_id AND type_id=NEW.type_id) THEN RAISE(ABORT,'CREDIT_TYPE_MISMATCH') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users u JOIN registrations r ON r.email=u.email AND r.status='approved' WHERE u.id=NEW.user_id AND COALESCE((SELECT status FROM participant_status_overrides WHERE user_id=u.id),'Checked in')='Checked in' AND (EXISTS(SELECT 1 FROM check_ins c WHERE c.user_id=u.id) OR EXISTS(SELECT 1 FROM manual_checkins m WHERE m.user_id=u.id AND m.verified_email=lower(u.email)))) THEN RAISE(ABORT,'CHECKIN_REQUIRED') END;
END;

--> statement-breakpoint
CREATE UNIQUE INDEX legacy_submission_request ON submission_versions(team_id,json_extract(payload,'$._requestKey')) WHERE json_extract(payload,'$._requestKey') IS NOT NULL;
