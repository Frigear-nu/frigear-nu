ALTER TABLE `users` ADD `searchText` text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Backfill: sqlite's lower() folds ASCII letters only; Ø, Æ and Å keep their case until the name is next written,
-- which stores the Unicode-folded name.
UPDATE `users` SET `searchText` = lower(`name`);
