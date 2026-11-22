CREATE TABLE `push_channel_preferences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`topic` text NOT NULL,
	`email` integer NOT NULL,
	`sms` integer NOT NULL,
	`push` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_channel_user_topic_idx` ON `push_channel_preferences` (`userId`,`topic`);--> statement-breakpoint
CREATE TABLE `push_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` integer NOT NULL,
	`platform` text NOT NULL,
	`token` text NOT NULL,
	`appId` text,
	`locale` text,
	`lastSeenAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`revokedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_devices_token_unique` ON `push_devices` (`token`);--> statement-breakpoint
CREATE INDEX `push_device_user_idx` ON `push_devices` (`userId`);