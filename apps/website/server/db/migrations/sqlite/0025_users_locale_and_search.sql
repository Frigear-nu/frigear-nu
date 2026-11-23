-- `users` gets the `search_text` and `phone` columns of `@frigear-nu/users` and loses the site's old `locale` default ('da'):
-- `@frigear-nu/users` owns the column, without a default. SQLite cannot drop a default, so the table is rebuilt.
-- Written by hand from drizzle's output (same table, columns and index):
-- * `defer_foreign_keys`, not `foreign_keys=OFF`: D1 runs a migration in a transaction and ignores `foreign_keys`. No
--   foreign key references `users` (dropped in 0016), so nothing cascades when the old table is dropped.
-- * The AUTOINCREMENT high-water mark is carried over before the old table is dropped. Otherwise it would fall back to
--   the highest id still present, and a new user could reuse a deleted user's id (tables keep user ids without keys).
-- * Nothing on main ever wrote `locale`: every stored value is the old default, not a choice. It is cleared, so the
--   app fills in each user's language the next time they sign in.
PRAGMA defer_foreign_keys = on;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`search_text` text DEFAULT '' NOT NULL,
	`email` text NOT NULL,
	`avatar` text,
	`phone` text,
	`locale` text,
	`accepted_terms_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`password` text,
	`email_verified_at` integer,
	`last_login_at` integer,
	`session_version` integer DEFAULT 0 NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`stripe_customer_id` text,
	`cookie_consent_accepted_at` integer,
	`cookie_consent_version` text,
	`cookie_consent_categories` text,
	`preferences` text
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "name", "email", "avatar", "locale", "accepted_terms_at", "created_at", "updated_at", "password", "email_verified_at", "last_login_at", "session_version", "role", "stripe_customer_id", "cookie_consent_accepted_at", "cookie_consent_version", "cookie_consent_categories", "preferences") SELECT "id", "name", "email", "avatar", NULL, "accepted_terms_at", "created_at", "updated_at", "password", "email_verified_at", "last_login_at", "session_version", "role", "stripe_customer_id", "cookie_consent_accepted_at", "cookie_consent_version", "cookie_consent_categories", "preferences" FROM `users`;--> statement-breakpoint
UPDATE `sqlite_sequence` SET `seq` = (SELECT `seq` FROM `sqlite_sequence` WHERE `name` = 'users') WHERE `name` = '__new_users' AND `seq` < (SELECT `seq` FROM `sqlite_sequence` WHERE `name` = 'users');--> statement-breakpoint
INSERT INTO `sqlite_sequence` (`name`, `seq`) SELECT '__new_users', `seq` FROM `sqlite_sequence` WHERE `name` = 'users' AND NOT EXISTS (SELECT 1 FROM `sqlite_sequence` WHERE `name` = '__new_users');--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA defer_foreign_keys = off;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
-- Backfill of `search_text` (the name folded for search; the app writes it with module-kit's searchText on every later
-- write). sqlite's lower() folds ASCII letters only: a stored Ø, Æ or Å keeps its case until the row is next written,
-- which stores the Unicode-folded text. The other searchable tables are new in this release and start empty.
UPDATE `users` SET `search_text` = lower(`name`);
