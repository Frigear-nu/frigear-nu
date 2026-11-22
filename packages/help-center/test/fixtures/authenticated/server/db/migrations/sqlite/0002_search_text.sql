ALTER TABLE `help_articles` ADD `searchText` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `help_articles` ADD `searchBody` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `searchText` text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Backfill: every language of the title plus the slug, and every language of the body, one per line. sqlite's lower()
-- folds ASCII letters only; Ø, Æ and Å keep their case until the article is next edited, which stores the
-- Unicode-folded text.
UPDATE `help_articles` SET
  `searchText` = lower(coalesce((SELECT group_concat(`value`, char(10)) FROM json_each(`help_articles`.`title`)), '') || char(10) || `slug`),
  `searchBody` = lower(coalesce((SELECT group_concat(`value`, char(10)) FROM json_each(`help_articles`.`body`)), ''));
--> statement-breakpoint
-- Backfill: sqlite's lower() folds ASCII letters only; Ø, Æ and Å keep their case until the name is next written,
-- which stores the Unicode-folded name.
UPDATE `users` SET `searchText` = lower(`name`);
