CREATE TABLE `oauth_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`secretHash` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`icon` text,
	`priority` integer DEFAULT 0 NOT NULL,
	`websiteUrl` text NOT NULL,
	`loginUrl` text,
	`previewUrlPattern` text,
	`redirectUris` text NOT NULL,
	`allowedRoles` text NOT NULL,
	`tags` text NOT NULL,
	`ownerId` integer,
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `oauth_application_active_idx` ON `oauth_applications` (`isActive`,`priority`);--> statement-breakpoint
CREATE TABLE `oauth_authorization_codes` (
	`codeHash` text PRIMARY KEY NOT NULL,
	`applicationId` text NOT NULL,
	`userId` integer NOT NULL,
	`redirectUri` text NOT NULL,
	`scope` text NOT NULL,
	`codeChallenge` text NOT NULL,
	`nonce` text,
	`authTime` integer NOT NULL,
	`expiresAt` integer NOT NULL,
	FOREIGN KEY (`applicationId`) REFERENCES `oauth_applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `oauth_code_application_idx` ON `oauth_authorization_codes` (`applicationId`);--> statement-breakpoint
CREATE TABLE `oauth_refresh_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`tokenHash` text NOT NULL,
	`applicationId` text NOT NULL,
	`userId` integer NOT NULL,
	`scope` text NOT NULL,
	`familyId` text NOT NULL,
	`replacedBy` text,
	`authTime` integer NOT NULL,
	`expiresAt` integer NOT NULL,
	`revokedAt` integer,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`applicationId`) REFERENCES `oauth_applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_refresh_tokens_tokenHash_unique` ON `oauth_refresh_tokens` (`tokenHash`);--> statement-breakpoint
CREATE INDEX `oauth_refresh_user_idx` ON `oauth_refresh_tokens` (`userId`,`applicationId`);--> statement-breakpoint
CREATE INDEX `oauth_refresh_family_idx` ON `oauth_refresh_tokens` (`familyId`);--> statement-breakpoint
CREATE TABLE `password_resets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`code` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`usedAt` integer,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `password_resets_code_unique` ON `password_resets` (`code`);--> statement-breakpoint
CREATE INDEX `password_reset_user_idx` ON `password_resets` (`userId`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password` text,
	`avatar` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);