CREATE TABLE `shift_digest_items` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`assignmentId` text NOT NULL,
	`teamId` text NOT NULL,
	`sentAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shift_digest_item_unique` ON `shift_digest_items` (`kind`,`assignmentId`);--> statement-breakpoint
CREATE TABLE `shift_perk_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`perkId` text NOT NULL,
	`assignmentId` text NOT NULL,
	`userId` integer NOT NULL,
	`voucherType` text NOT NULL,
	`quantity` integer NOT NULL,
	`earnedAt` integer NOT NULL,
	`claimedAt` integer,
	`claimClient` text,
	`revokedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shift_perk_grant_unique` ON `shift_perk_grants` (`perkId`,`assignmentId`);--> statement-breakpoint
CREATE INDEX `shift_perk_grant_user_idx` ON `shift_perk_grants` (`userId`,`claimedAt`);--> statement-breakpoint
CREATE INDEX `shift_perk_grant_assignment_idx` ON `shift_perk_grants` (`assignmentId`);--> statement-breakpoint
CREATE TABLE `shift_stations` (
	`id` text PRIMARY KEY NOT NULL,
	`scheduleId` text NOT NULL,
	`teamId` text NOT NULL,
	`name` text NOT NULL,
	`featureId` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shift_station_schedule_idx` ON `shift_stations` (`scheduleId`);--> statement-breakpoint
DROP TABLE `shift_perk_redemptions`;--> statement-breakpoint
ALTER TABLE `shift_assignments` ADD `checkInMethod` text;--> statement-breakpoint
ALTER TABLE `shift_perks` ADD `voucherType` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `shift_perks` ADD `quantity` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `shift_perks` DROP COLUMN `kind`;--> statement-breakpoint
ALTER TABLE `shift_perks` DROP COLUMN `perShift`;--> statement-breakpoint
ALTER TABLE `shift_perks` DROP COLUMN `perPerson`;--> statement-breakpoint
ALTER TABLE `shift_schedules` ADD `checkIn` text;--> statement-breakpoint
ALTER TABLE `shift_schedules` ADD `autoNoShow` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `shift_schedules` ADD `autoNoShowMinutes` integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE `shifts` ADD `closedAt` integer;--> statement-breakpoint
CREATE INDEX `shift_end_closed_idx` ON `shifts` (`endsAt`,`closedAt`);