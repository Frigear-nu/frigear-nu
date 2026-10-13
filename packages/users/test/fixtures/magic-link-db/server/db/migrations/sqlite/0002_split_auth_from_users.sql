PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_magic_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`code` text NOT NULL,
	`redirectUrl` text,
	`expiresAt` integer NOT NULL,
	`usedAt` integer,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_magic_links`("id", "userId", "code", "redirectUrl", "expiresAt", "usedAt", "createdAt") SELECT "id", "userId", "code", "redirectUrl", "expiresAt", "usedAt", "createdAt" FROM `magic_links`;--> statement-breakpoint
DROP TABLE `magic_links`;--> statement-breakpoint
ALTER TABLE `__new_magic_links` RENAME TO `magic_links`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `magic_links_code_unique` ON `magic_links` (`code`);--> statement-breakpoint
CREATE INDEX `magic_link_user_idx` ON `magic_links` (`userId`);--> statement-breakpoint
CREATE TABLE `__new_password_resets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`code` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`usedAt` integer,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_password_resets`("id", "userId", "code", "expiresAt", "usedAt", "createdAt") SELECT "id", "userId", "code", "expiresAt", "usedAt", "createdAt" FROM `password_resets`;--> statement-breakpoint
DROP TABLE `password_resets`;--> statement-breakpoint
ALTER TABLE `__new_password_resets` RENAME TO `password_resets`;--> statement-breakpoint
CREATE UNIQUE INDEX `password_resets_code_unique` ON `password_resets` (`code`);--> statement-breakpoint
CREATE INDEX `password_reset_user_idx` ON `password_resets` (`userId`);--> statement-breakpoint
ALTER TABLE `users` ADD `accepted_terms_at` integer;