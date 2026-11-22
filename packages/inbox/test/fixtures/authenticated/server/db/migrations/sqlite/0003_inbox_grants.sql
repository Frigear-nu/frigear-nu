ALTER TABLE `inbox_mailboxes` DROP COLUMN `visibility`;--> statement-breakpoint
ALTER TABLE `inbox_mailboxes` ADD `grants` text DEFAULT '[]' NOT NULL;