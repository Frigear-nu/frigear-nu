ALTER TABLE `operations` ADD `searchText` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `searchText` text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Backfill: sqlite's lower() folds ASCII letters only; Ø, Æ and Å keep their case until the name is next written,
-- which stores the Unicode-folded name.
UPDATE `users` SET `searchText` = lower(`name`);
--> statement-breakpoint
-- Backfill: every language of the name and the slug, one per line. sqlite's lower() folds ASCII letters only; Ø, Æ and
-- Å keep their case until the operation is next renamed, which stores the Unicode-folded text.
UPDATE `operations` SET `searchText` = lower(coalesce((SELECT group_concat(`value`, char(10)) FROM json_each(`operations`.`name`)), '') || char(10) || `slug`);
