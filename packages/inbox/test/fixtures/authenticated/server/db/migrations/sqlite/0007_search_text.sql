ALTER TABLE `inbox_threads` ADD `searchText` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `searchText` text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Backfill: the subject (empty for anonymised threads). sqlite's lower() folds ASCII letters only; Ø, Æ and Å keep
-- their case in threads stored before this migration, new threads store the Unicode-folded subject.
UPDATE `inbox_threads` SET `searchText` = lower(coalesce(`subject`, ''));
--> statement-breakpoint
-- Backfill: sqlite's lower() folds ASCII letters only; Ø, Æ and Å keep their case until the name is next written,
-- which stores the Unicode-folded name.
UPDATE `users` SET `searchText` = lower(`name`);
