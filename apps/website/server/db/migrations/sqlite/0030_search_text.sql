ALTER TABLE `help_articles` ADD `search_text` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `help_articles` ADD `search_body` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `inbox_threads` ADD `search_text` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `operations` ADD `search_text` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `teams` ADD `search_text` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `search_text` text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Backfill of the search columns (texts folded for search; the app writes them with module-kit's searchText on every
-- later write). sqlite's lower() folds ASCII letters only: a stored Ø, Æ or Å keeps its case until the row is next
-- written, which stores the Unicode-folded text. Translated texts give every language, one per line.
UPDATE `users` SET `search_text` = lower(`name`);--> statement-breakpoint
UPDATE `operations` SET `search_text` = lower(coalesce((SELECT group_concat(`value`, char(10)) FROM json_each(`operations`.`name`)), '') || char(10) || `slug`);--> statement-breakpoint
UPDATE `teams` SET `search_text` = lower(coalesce((SELECT group_concat(`value`, char(10)) FROM json_each(`teams`.`name`)), ''));--> statement-breakpoint
UPDATE `help_articles` SET
  `search_text` = lower(coalesce((SELECT group_concat(`value`, char(10)) FROM json_each(`help_articles`.`title`)), '') || char(10) || `slug`),
  `search_body` = lower(coalesce((SELECT group_concat(`value`, char(10)) FROM json_each(`help_articles`.`body`)), ''));--> statement-breakpoint
UPDATE `inbox_threads` SET `search_text` = lower(coalesce(`subject`, ''));
