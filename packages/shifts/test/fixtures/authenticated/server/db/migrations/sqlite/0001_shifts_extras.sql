CREATE TABLE `shift_broadcasts` (
	`id` text PRIMARY KEY NOT NULL,
	`operationId` text NOT NULL,
	`teamId` text,
	`shiftId` text,
	`teamRole` text,
	`channels` text NOT NULL,
	`subject` text NOT NULL,
	`message` text NOT NULL,
	`recipientCount` integer NOT NULL,
	`sentBy` integer NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shift_broadcast_operation_idx` ON `shift_broadcasts` (`operationId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `shift_feed_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` integer NOT NULL,
	`tokenHash` text NOT NULL,
	`prefix` text NOT NULL,
	`createdAt` integer NOT NULL,
	`lastUsedAt` integer,
	`revokedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shift_feed_token_hash_unique` ON `shift_feed_tokens` (`tokenHash`);--> statement-breakpoint
CREATE INDEX `shift_feed_token_user_idx` ON `shift_feed_tokens` (`userId`);--> statement-breakpoint
CREATE TABLE `shift_perk_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`perkId` text NOT NULL,
	`assignmentId` text NOT NULL,
	`userId` integer NOT NULL,
	`redeemedAt` integer NOT NULL,
	`redeemedBy` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shift_perk_redemption_assignment_idx` ON `shift_perk_redemptions` (`perkId`,`assignmentId`);--> statement-breakpoint
CREATE INDEX `shift_perk_redemption_user_idx` ON `shift_perk_redemptions` (`perkId`,`userId`);--> statement-breakpoint
CREATE TABLE `shift_perks` (
	`id` text PRIMARY KEY NOT NULL,
	`operationId` text NOT NULL,
	`teamId` text,
	`kind` text DEFAULT 'meal' NOT NULL,
	`name` text NOT NULL,
	`perShift` integer,
	`perPerson` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shift_perk_operation_idx` ON `shift_perks` (`operationId`);--> statement-breakpoint
CREATE TABLE `shift_reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`assignmentId` text NOT NULL,
	`offsetMinutes` integer NOT NULL,
	`userId` integer NOT NULL,
	`sentAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shift_reminder_unique` ON `shift_reminders` (`assignmentId`,`offsetMinutes`);