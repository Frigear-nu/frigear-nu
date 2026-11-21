ALTER TABLE `faq_groups` DROP COLUMN `visibility`;--> statement-breakpoint
ALTER TABLE `faq_items` DROP COLUMN `visibility`;--> statement-breakpoint
ALTER TABLE `faq_groups` ADD `grants` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `faq_items` ADD `grants` text;