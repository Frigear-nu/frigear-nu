ALTER TABLE `help_categories` ADD `kind` text DEFAULT 'help' NOT NULL;--> statement-breakpoint
-- The categories shown as questions (accordion) or question cards are the site's FAQs: they become kind 'faq'.
UPDATE `help_categories` SET `kind` = 'faq' WHERE `display` IN ('accordion', 'cards');
