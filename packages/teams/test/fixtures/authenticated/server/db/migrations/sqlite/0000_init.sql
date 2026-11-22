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
CREATE TABLE `team_members` (
	`id` text PRIMARY KEY NOT NULL,
	`teamId` text NOT NULL,
	`userId` integer NOT NULL,
	`role` text NOT NULL,
	`status` text,
	`addedBy` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_member_unique` ON `team_members` (`teamId`,`userId`);--> statement-breakpoint
CREATE INDEX `team_member_user_idx` ON `team_members` (`userId`);--> statement-breakpoint
CREATE TABLE `team_role_ladders` (
	`kind` text PRIMARY KEY NOT NULL,
	`roles` text NOT NULL,
	`leadFrom` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `team_role_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`ownerType` text NOT NULL,
	`ownerId` text,
	`teamId` text,
	`match` text NOT NULL,
	`teamRole` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `team_mapping_owner_idx` ON `team_role_mappings` (`ownerType`,`ownerId`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`ownerType` text NOT NULL,
	`ownerId` text,
	`parentId` text,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`capacity` integer,
	`sort` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `team_owner_idx` ON `teams` (`ownerType`,`ownerId`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
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