CREATE TABLE `account_email_changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`oldEmail` text NOT NULL,
	`newEmail` text NOT NULL,
	`code` text NOT NULL,
	`revertCode` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`verifiedAt` integer,
	`revertExpiresAt` integer,
	`revertedAt` integer,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_email_changes_code_unique` ON `account_email_changes` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `account_email_changes_revertCode_unique` ON `account_email_changes` (`revertCode`);--> statement-breakpoint
CREATE INDEX `account_email_change_user_idx` ON `account_email_changes` (`userId`);