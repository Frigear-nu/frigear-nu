CREATE TABLE `inbox_email_cursors` (
	`key` text PRIMARY KEY NOT NULL,
	`channel_account_id` text NOT NULL,
	`driver` text NOT NULL,
	`state` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`channel_account_id`) REFERENCES `inbox_channel_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `inbox_email_cursor_account_idx` ON `inbox_email_cursors` (`channel_account_id`);