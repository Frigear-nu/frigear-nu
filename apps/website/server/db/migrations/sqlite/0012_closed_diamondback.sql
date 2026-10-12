CREATE TABLE `form_access` (
	`form_id` text PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `form_access_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`form_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `form_access_tokens_tokenHash_unique` ON `form_access_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `form_access_token_form_idx` ON `form_access_tokens` (`form_id`);--> statement-breakpoint
CREATE TABLE `form_secrets` (
	`form_id` text PRIMARY KEY NOT NULL,
	`secrets` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`backed_up` integer DEFAULT false NOT NULL,
	`transports` text,
	`name` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_credential_user_idx` ON `user_credentials` (`user_id`);--> statement-breakpoint
DROP TABLE `user_passkeys`;--> statement-breakpoint
ALTER TABLE `event_tickets` ADD `locale` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `source` text DEFAULT 'stripe' NOT NULL;