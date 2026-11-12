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
	`is_active` integer DEFAULT true NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `auth_user_tokens` ADD `permissions` text;--> statement-breakpoint
ALTER TABLE `oauth_applications` ADD `wildcard_scopes` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `oauth_authorization_codes` ADD `scope_versions` text;--> statement-breakpoint
ALTER TABLE `oauth_refresh_tokens` ADD `scope_versions` text;