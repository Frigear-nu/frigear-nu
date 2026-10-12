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
CREATE UNIQUE INDEX `form_access_tokens_token_hash_unique` ON `form_access_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `form_access_token_form_idx` ON `form_access_tokens` (`form_id`);
