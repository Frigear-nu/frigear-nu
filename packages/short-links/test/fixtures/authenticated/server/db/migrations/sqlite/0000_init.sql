CREATE TABLE `auth_user_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`name` text NOT NULL,
	`tokenHash` text NOT NULL,
	`prefix` text NOT NULL,
	`last4` text NOT NULL,
	`scopes` text NOT NULL,
	`permissions` text,
	`expiresAt` integer,
	`lastUsedAt` integer,
	`revokedAt` integer,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_user_tokens_tokenHash_unique` ON `auth_user_tokens` (`tokenHash`);--> statement-breakpoint
CREATE INDEX `auth_user_tokens_user_idx` ON `auth_user_tokens` (`userId`);--> statement-breakpoint
CREATE TABLE `password_resets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`code` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`usedAt` integer,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `password_resets_code_unique` ON `password_resets` (`code`);--> statement-breakpoint
CREATE INDEX `password_reset_user_idx` ON `password_resets` (`userId`);--> statement-breakpoint
CREATE TABLE `short_link_clicks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`linkId` text NOT NULL,
	`at` integer NOT NULL,
	`subject` text,
	`referrerHost` text,
	FOREIGN KEY (`linkId`) REFERENCES `short_links`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `short_link_clicks_link_idx` ON `short_link_clicks` (`linkId`,`at`);--> statement-breakpoint
CREATE INDEX `short_link_clicks_at_idx` ON `short_link_clicks` (`at`);--> statement-breakpoint
CREATE TABLE `short_links` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`url` text NOT NULL,
	`ownerModule` text NOT NULL,
	`ownerRefId` text,
	`title` text,
	`track` integer DEFAULT true NOT NULL,
	`expiresAt` integer,
	`disabledAt` integer,
	`clicks` integer DEFAULT 0 NOT NULL,
	`lastClickedAt` integer,
	`createdBy` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `short_links_code_idx` ON `short_links` (`code`);--> statement-breakpoint
CREATE INDEX `short_links_owner_idx` ON `short_links` (`ownerModule`,`ownerRefId`);--> statement-breakpoint
CREATE INDEX `short_links_created_idx` ON `short_links` (`createdAt`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`searchText` text DEFAULT '' NOT NULL,
	`email` text NOT NULL,
	`avatar` text,
	`phone` text,
	`locale` text,
	`accepted_terms_at` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`password` text,
	`emailVerifiedAt` integer,
	`lastLoginAt` integer,
	`sessionVersion` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);