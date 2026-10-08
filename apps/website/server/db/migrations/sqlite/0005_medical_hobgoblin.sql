CREATE TABLE `oauth_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`secret_hash` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`icon` text,
	`priority` integer DEFAULT 0 NOT NULL,
	`website_url` text NOT NULL,
	`login_url` text,
	`preview_url_pattern` text,
	`redirect_uris` text NOT NULL,
	`allowed_roles` text NOT NULL,
	`tags` text NOT NULL,
	`owner_id` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `oauth_application_active_idx` ON `oauth_applications` (`is_active`,`priority`);--> statement-breakpoint
CREATE TABLE `oauth_authorization_codes` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`redirect_uri` text NOT NULL,
	`scope` text NOT NULL,
	`code_challenge` text NOT NULL,
	`nonce` text,
	`auth_time` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `oauth_applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `oauth_code_application_idx` ON `oauth_authorization_codes` (`application_id`);--> statement-breakpoint
CREATE TABLE `oauth_refresh_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`application_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`scope` text NOT NULL,
	`family_id` text NOT NULL,
	`replaced_by` text,
	`auth_time` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `oauth_applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_refresh_tokens_tokenHash_unique` ON `oauth_refresh_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `oauth_refresh_user_idx` ON `oauth_refresh_tokens` (`user_id`,`application_id`);--> statement-breakpoint
CREATE INDEX `oauth_refresh_family_idx` ON `oauth_refresh_tokens` (`family_id`);