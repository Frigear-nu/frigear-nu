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
CREATE TABLE `form_access` (
	`formId` text PRIMARY KEY NOT NULL,
	`passwordHash` text NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`formId`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `form_access_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`formId` text NOT NULL,
	`name` text NOT NULL,
	`tokenHash` text NOT NULL,
	`prefix` text NOT NULL,
	`createdAt` integer NOT NULL,
	`lastUsedAt` integer,
	`revokedAt` integer,
	FOREIGN KEY (`formId`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `form_access_tokens_tokenHash_unique` ON `form_access_tokens` (`tokenHash`);--> statement-breakpoint
CREATE INDEX `form_access_token_form_idx` ON `form_access_tokens` (`formId`);--> statement-breakpoint
CREATE TABLE `form_secrets` (
	`formId` text PRIMARY KEY NOT NULL,
	`secrets` text NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`formId`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `form_submission_files` (
	`id` text PRIMARY KEY NOT NULL,
	`submissionId` text NOT NULL,
	`fieldKey` text NOT NULL,
	`pathname` text NOT NULL,
	`filename` text NOT NULL,
	`contentType` text NOT NULL,
	`size` integer NOT NULL,
	FOREIGN KEY (`submissionId`) REFERENCES `form_submissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `form_submission_file_submission_idx` ON `form_submission_files` (`submissionId`);--> statement-breakpoint
CREATE TABLE `form_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`formId` text NOT NULL,
	`formSlug` text NOT NULL,
	`formVersion` integer NOT NULL,
	`definitionSnapshot` text NOT NULL,
	`answers` text NOT NULL,
	`userId` integer,
	`locale` text DEFAULT 'en' NOT NULL,
	`deliveryStatus` text DEFAULT 'none' NOT NULL,
	`deliveryError` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`formId`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `form_submission_form_idx` ON `form_submissions` (`formId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `forms` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`definition` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `forms_slug_unique` ON `forms` (`slug`);--> statement-breakpoint
CREATE TABLE `inbox_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`threadId` text,
	`contactId` text,
	`actorId` integer,
	`action` text NOT NULL,
	`data` text,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inbox_audit_thread_idx` ON `inbox_audit` (`threadId`);--> statement-breakpoint
CREATE INDEX `inbox_audit_created_idx` ON `inbox_audit` (`createdAt`);--> statement-breakpoint
CREATE TABLE `inbox_channel_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`mailboxId` text NOT NULL,
	`channel` text NOT NULL,
	`address` text NOT NULL,
	`config` text NOT NULL,
	`secretRef` text,
	`enabled` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`mailboxId`) REFERENCES `inbox_mailboxes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inbox_channel_address_idx` ON `inbox_channel_accounts` (`channel`,`address`);--> statement-breakpoint
CREATE INDEX `inbox_channel_mailbox_idx` ON `inbox_channel_accounts` (`mailboxId`);--> statement-breakpoint
CREATE TABLE `inbox_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text NOT NULL,
	`externalId` text NOT NULL,
	`name` text,
	`email` text,
	`phone` text,
	`userId` integer,
	`erasedAt` integer,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inbox_contact_external_idx` ON `inbox_contacts` (`channel`,`externalId`);--> statement-breakpoint
CREATE INDEX `inbox_contact_user_idx` ON `inbox_contacts` (`userId`);--> statement-breakpoint
CREATE TABLE `inbox_mailboxes` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`ownerType` text NOT NULL,
	`ownerId` text,
	`name` text NOT NULL,
	`visibility` text,
	`retentionDays` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inbox_mailboxes_key_unique` ON `inbox_mailboxes` (`key`);--> statement-breakpoint
CREATE INDEX `inbox_mailbox_owner_idx` ON `inbox_mailboxes` (`ownerType`,`ownerId`);--> statement-breakpoint
CREATE TABLE `inbox_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`threadId` text NOT NULL,
	`direction` text NOT NULL,
	`authorId` integer,
	`body` text NOT NULL,
	`attachments` text NOT NULL,
	`externalId` text,
	`createdAtMs` integer NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`threadId`) REFERENCES `inbox_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inbox_messages_externalId_unique` ON `inbox_messages` (`externalId`);--> statement-breakpoint
CREATE INDEX `inbox_message_thread_idx` ON `inbox_messages` (`threadId`,`createdAtMs`);--> statement-breakpoint
CREATE TABLE `inbox_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`mailboxId` text NOT NULL,
	`contactId` text NOT NULL,
	`channelAccountId` text,
	`channel` text NOT NULL,
	`subject` text,
	`status` text DEFAULT 'open' NOT NULL,
	`assigneeId` integer,
	`hiddenBelow` text,
	`lastMessageAt` integer NOT NULL,
	`anonymisedAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`mailboxId`) REFERENCES `inbox_mailboxes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contactId`) REFERENCES `inbox_contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`channelAccountId`) REFERENCES `inbox_channel_accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `inbox_thread_mailbox_idx` ON `inbox_threads` (`mailboxId`,`status`);--> statement-breakpoint
CREATE INDEX `inbox_thread_assignee_idx` ON `inbox_threads` (`assigneeId`);--> statement-breakpoint
CREATE INDEX `inbox_thread_contact_idx` ON `inbox_threads` (`contactId`);--> statement-breakpoint
CREATE INDEX `inbox_thread_last_idx` ON `inbox_threads` (`lastMessageAt`);--> statement-breakpoint
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
	`email` text NOT NULL,
	`avatar` text,
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