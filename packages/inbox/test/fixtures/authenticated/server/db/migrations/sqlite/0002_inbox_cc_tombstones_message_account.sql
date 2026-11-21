CREATE TABLE `inbox_tombstones` (
	`key` text PRIMARY KEY NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inbox_tombstone_created_idx` ON `inbox_tombstones` (`createdAt`);--> statement-breakpoint
DROP INDEX `inbox_messages_externalId_unique`;--> statement-breakpoint
ALTER TABLE `inbox_messages` ADD `cc` text;--> statement-breakpoint
ALTER TABLE `inbox_messages` ADD `channelAccountId` text;--> statement-breakpoint
CREATE UNIQUE INDEX `inbox_message_external_idx` ON `inbox_messages` (`channelAccountId`,`externalId`);--> statement-breakpoint
ALTER TABLE `inbox_audit` ADD `mailboxId` text;--> statement-breakpoint
CREATE INDEX `inbox_audit_mailbox_idx` ON `inbox_audit` (`mailboxId`);