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
CREATE TABLE `oauth_scopes` (
	`name` text PRIMARY KEY NOT NULL,
	`label` text,
	`description` text,
	`icon` text,
	`permissions` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`isActive` integer DEFAULT true NOT NULL,
	`deletedAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `auth_user_tokens` ADD `permissions` text;--> statement-breakpoint
ALTER TABLE `oauth_applications` ADD `wildcardScopes` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `oauth_authorization_codes` ADD `scopeVersions` text;--> statement-breakpoint
ALTER TABLE `oauth_refresh_tokens` ADD `scopeVersions` text;