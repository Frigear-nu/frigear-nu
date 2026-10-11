CREATE TABLE `account_email_changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`old_email` text NOT NULL,
	`new_email` text NOT NULL,
	`code` text NOT NULL,
	`revert_code` text NOT NULL,
	`expires_at` integer NOT NULL,
	`verified_at` integer,
	`revert_expires_at` integer,
	`reverted_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_email_changes_code_unique` ON `account_email_changes` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `account_email_changes_revertCode_unique` ON `account_email_changes` (`revert_code`);--> statement-breakpoint
CREATE INDEX `account_email_change_user_idx` ON `account_email_changes` (`user_id`);