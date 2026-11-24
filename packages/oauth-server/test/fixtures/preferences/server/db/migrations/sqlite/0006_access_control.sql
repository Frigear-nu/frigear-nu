CREATE TABLE `oauth_scopes` (
	`name` text PRIMARY KEY NOT NULL,
	`label` text,
	`description` text,
	`icon` text,
	`permissions` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `auth_user_tokens` ADD `permissions` text;--> statement-breakpoint
ALTER TABLE `oauth_applications` ADD `wildcardScopes` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `oauth_authorization_codes` ADD `scopeVersions` text;--> statement-breakpoint
ALTER TABLE `oauth_refresh_tokens` ADD `scopeVersions` text;