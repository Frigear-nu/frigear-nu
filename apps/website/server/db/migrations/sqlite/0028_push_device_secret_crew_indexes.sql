ALTER TABLE `push_devices` ADD `secret_hash` text;--> statement-breakpoint
ALTER TABLE `push_devices` ADD `failures` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `team_member_submission_idx` ON `team_members` (`submission_id`);--> statement-breakpoint
CREATE INDEX `team_member_crew_status_idx` ON `team_members` (`crew_status`);