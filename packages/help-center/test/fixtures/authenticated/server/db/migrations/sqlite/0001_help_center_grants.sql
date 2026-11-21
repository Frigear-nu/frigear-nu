ALTER TABLE `faq_groups` DROP COLUMN `visibility`;--> statement-breakpoint
ALTER TABLE `faq_items` DROP COLUMN `visibility`;--> statement-breakpoint
ALTER TABLE `help_articles` DROP COLUMN `visibility`;--> statement-breakpoint
ALTER TABLE `help_categories` DROP COLUMN `visibility`;--> statement-breakpoint
ALTER TABLE `help_checklists` DROP COLUMN `visibility`;--> statement-breakpoint
ALTER TABLE `faq_groups` ADD `grants` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `faq_items` ADD `grants` text;--> statement-breakpoint
ALTER TABLE `help_articles` ADD `grants` text;--> statement-breakpoint
ALTER TABLE `help_categories` ADD `grants` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `help_checklists` ADD `grants` text DEFAULT '[]' NOT NULL;