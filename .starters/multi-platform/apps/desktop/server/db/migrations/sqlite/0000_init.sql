CREATE TABLE `auth_frigear_handoffs` (
	`id` text PRIMARY KEY NOT NULL,
	`secretHash` text NOT NULL,
	`stateHash` text NOT NULL,
	`codeVerifier` text NOT NULL,
	`nonce` text NOT NULL,
	`redirectUri` text NOT NULL,
	`redirectTo` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`userId` integer,
	`sessionData` text,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_frigear_handoffs_stateHash_unique` ON `auth_frigear_handoffs` (`stateHash`);--> statement-breakpoint
CREATE INDEX `auth_frigear_handoffs_expires_idx` ON `auth_frigear_handoffs` (`expiresAt`);--> statement-breakpoint
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
CREATE TABLE `authorization_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `authorization_user_roles` (
	`user_id` integer NOT NULL,
	`role` text NOT NULL,
	`source` text NOT NULL,
	`granted_by` integer,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `role`)
);
--> statement-breakpoint
CREATE INDEX `authorization_user_roles_role_idx` ON `authorization_user_roles` (`role`);--> statement-breakpoint
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
	`role` text DEFAULT 'user' NOT NULL,
	`password` text,
	`emailVerifiedAt` integer,
	`lastLoginAt` integer,
	`sessionVersion` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);