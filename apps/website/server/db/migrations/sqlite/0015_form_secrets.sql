CREATE TABLE `form_secrets` (
	`form_id` text PRIMARY KEY NOT NULL,
	`secrets` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade
);
