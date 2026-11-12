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
ALTER TABLE `auth_user_tokens` ADD `permissions` text;