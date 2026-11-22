ALTER TABLE `shift_perk_grants` RENAME TO `shift_earned_perks`;--> statement-breakpoint
DROP INDEX `shift_perk_grant_unique`;--> statement-breakpoint
DROP INDEX `shift_perk_grant_user_idx`;--> statement-breakpoint
DROP INDEX `shift_perk_grant_assignment_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `shift_earned_perk_unique` ON `shift_earned_perks` (`perkId`,`assignmentId`);--> statement-breakpoint
CREATE INDEX `shift_earned_perk_user_idx` ON `shift_earned_perks` (`userId`,`claimedAt`);--> statement-breakpoint
CREATE INDEX `shift_earned_perk_assignment_idx` ON `shift_earned_perks` (`assignmentId`);