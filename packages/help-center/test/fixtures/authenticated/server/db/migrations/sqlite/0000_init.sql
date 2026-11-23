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
CREATE TABLE `help_articles` (
	`id` text PRIMARY KEY NOT NULL,
	`categoryId` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`icon` text,
	`links` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`grants` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`publishedAt` integer,
	`updatedBy` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`categoryId`) REFERENCES `help_categories`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `help_articles_slug_unique` ON `help_articles` (`slug`);--> statement-breakpoint
CREATE INDEX `help_article_category_status_idx` ON `help_articles` (`categoryId`,`status`);--> statement-breakpoint
CREATE TABLE `help_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`parentId` text,
	`ownerType` text DEFAULT 'platform' NOT NULL,
	`ownerId` text,
	`grants` text DEFAULT '[]' NOT NULL,
	`display` text DEFAULT 'list' NOT NULL,
	`icon` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `help_categories_slug_unique` ON `help_categories` (`slug`);--> statement-breakpoint
CREATE INDEX `help_category_owner_idx` ON `help_categories` (`ownerType`,`ownerId`);--> statement-breakpoint
CREATE INDEX `help_category_parent_idx` ON `help_categories` (`parentId`);--> statement-breakpoint
CREATE TABLE `help_checklist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`checklistId` text NOT NULL,
	`articleId` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`required` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`checklistId`) REFERENCES `help_checklists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `help_checklist_item_article_idx` ON `help_checklist_items` (`checklistId`,`articleId`);--> statement-breakpoint
CREATE INDEX `help_checklist_item_sort_idx` ON `help_checklist_items` (`checklistId`,`sort`);--> statement-breakpoint
CREATE TABLE `help_checklists` (
	`id` text PRIMARY KEY NOT NULL,
	`operationId` text,
	`name` text NOT NULL,
	`grants` text DEFAULT '[]' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `help_checklist_operation_idx` ON `help_checklists` (`operationId`);--> statement-breakpoint
CREATE TABLE `help_reads` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`articleId` text NOT NULL,
	`readAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `help_read_user_article_idx` ON `help_reads` (`userId`,`articleId`);--> statement-breakpoint
CREATE INDEX `help_read_article_idx` ON `help_reads` (`articleId`);--> statement-breakpoint
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
	`sessionVersion` integer DEFAULT 0 NOT NULL,
	`phone` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);