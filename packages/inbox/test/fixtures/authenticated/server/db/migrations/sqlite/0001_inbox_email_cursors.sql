CREATE TABLE `inbox_email_cursors` (
	`key` text PRIMARY KEY NOT NULL,
	`channelAccountId` text NOT NULL,
	`driver` text NOT NULL,
	`state` text NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`channelAccountId`) REFERENCES `inbox_channel_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `inbox_email_cursor_account_idx` ON `inbox_email_cursors` (`channelAccountId`);