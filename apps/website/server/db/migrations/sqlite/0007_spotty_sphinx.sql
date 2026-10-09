CREATE TABLE IF NOT EXISTS `form_submission_files` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`field_key` text NOT NULL,
	`pathname` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `form_submissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `form_submission_file_submission_idx` ON `form_submission_files` (`submission_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `form_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`form_id` text NOT NULL,
	`form_slug` text NOT NULL,
	`form_version` integer NOT NULL,
	`definition_snapshot` text NOT NULL,
	`answers` text NOT NULL,
	`user_id` integer,
	`locale` text DEFAULT 'en' NOT NULL,
	`delivery_status` text DEFAULT 'none' NOT NULL,
	`delivery_error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `form_submission_form_idx` ON `form_submissions` (`form_id`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `forms` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`definition` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `forms_slug_unique` ON `forms` (`slug`);