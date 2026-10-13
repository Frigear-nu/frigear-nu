PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_magic_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`code` text NOT NULL,
	`redirect_url` text,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_magic_links`("id", "user_id", "code", "redirect_url", "expires_at", "used_at", "created_at") SELECT "id", "user_id", "code", "redirect_url", "expires_at", "used_at", "created_at" FROM `magic_links`;--> statement-breakpoint
DROP TABLE `magic_links`;--> statement-breakpoint
ALTER TABLE `__new_magic_links` RENAME TO `magic_links`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `magic_links_code_unique` ON `magic_links` (`code`);--> statement-breakpoint
CREATE INDEX `magic_link_user_idx` ON `magic_links` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_password_resets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`code` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_password_resets`("id", "user_id", "code", "expires_at", "used_at", "created_at") SELECT "id", "user_id", "code", "expires_at", "used_at", "created_at" FROM `password_resets`;--> statement-breakpoint
DROP TABLE `password_resets`;--> statement-breakpoint
ALTER TABLE `__new_password_resets` RENAME TO `password_resets`;--> statement-breakpoint
CREATE UNIQUE INDEX `password_resets_code_unique` ON `password_resets` (`code`);--> statement-breakpoint
CREATE INDEX `password_reset_user_idx` ON `password_resets` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_user_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`backed_up` integer DEFAULT false NOT NULL,
	`transports` text,
	`name` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_user_credentials`("id", "user_id", "public_key", "counter", "backed_up", "transports", "name", "created_at") SELECT "id", "user_id", "public_key", "counter", "backed_up", "transports", "name", "created_at" FROM `user_credentials`;--> statement-breakpoint
DROP TABLE `user_credentials`;--> statement-breakpoint
ALTER TABLE `__new_user_credentials` RENAME TO `user_credentials`;--> statement-breakpoint
CREATE INDEX `user_credential_user_idx` ON `user_credentials` (`user_id`);