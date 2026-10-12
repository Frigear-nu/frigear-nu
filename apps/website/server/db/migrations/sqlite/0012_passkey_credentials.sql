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
DROP TABLE `user_passkeys`;
