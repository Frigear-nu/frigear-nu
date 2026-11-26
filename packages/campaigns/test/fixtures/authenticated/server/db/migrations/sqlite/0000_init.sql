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
CREATE TABLE `campaign_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`phone` text,
	`userId` integer,
	`name` text,
	`locale` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_contact_email_unique` ON `campaign_contacts` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_contact_phone_unique` ON `campaign_contacts` (`phone`);--> statement-breakpoint
CREATE INDEX `campaign_contact_user_idx` ON `campaign_contacts` (`userId`);--> statement-breakpoint
CREATE TABLE `campaign_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`channels` text NOT NULL,
	`doubleOptIn` integer DEFAULT true NOT NULL,
	`public` integer DEFAULT true NOT NULL,
	`consentText` text,
	`consentVersion` integer DEFAULT 1 NOT NULL,
	`formId` text,
	`formFields` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_list_slug_unique` ON `campaign_lists` (`slug`);--> statement-breakpoint
CREATE TABLE `campaign_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`listId` text NOT NULL,
	`contactId` text NOT NULL,
	`channel` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`confirmTokenHash` text,
	`confirmExpiresAt` integer,
	`source` text NOT NULL,
	`consentVersion` integer,
	`requestedAt` integer NOT NULL,
	`confirmedAt` integer,
	`ipHash` text,
	`unsubscribedAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`listId`) REFERENCES `campaign_lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contactId`) REFERENCES `campaign_contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_subscription_unique` ON `campaign_subscriptions` (`listId`,`contactId`,`channel`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_subscription_confirm_unique` ON `campaign_subscriptions` (`confirmTokenHash`);--> statement-breakpoint
CREATE INDEX `campaign_subscription_list_status_idx` ON `campaign_subscriptions` (`listId`,`status`);--> statement-breakpoint
CREATE INDEX `campaign_subscription_contact_idx` ON `campaign_subscriptions` (`contactId`);--> statement-breakpoint
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