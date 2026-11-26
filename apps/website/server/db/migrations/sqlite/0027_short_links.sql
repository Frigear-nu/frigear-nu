CREATE TABLE `short_link_clicks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`link_id` text NOT NULL,
	`at` integer NOT NULL,
	`subject` text,
	`referrer_host` text,
	FOREIGN KEY (`link_id`) REFERENCES `short_links`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `short_link_clicks_link_idx` ON `short_link_clicks` (`link_id`,`at`);--> statement-breakpoint
CREATE INDEX `short_link_clicks_at_idx` ON `short_link_clicks` (`at`);--> statement-breakpoint
CREATE TABLE `short_links` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`url` text NOT NULL,
	`owner_module` text NOT NULL,
	`owner_ref_id` text,
	`title` text,
	`track` integer DEFAULT true NOT NULL,
	`expires_at` integer,
	`auto_delete` integer DEFAULT false NOT NULL,
	`disabled_at` integer,
	`clicks` integer DEFAULT 0 NOT NULL,
	`last_clicked_at` integer,
	`created_by` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `short_links_code_idx` ON `short_links` (`code`);--> statement-breakpoint
CREATE INDEX `short_links_owner_idx` ON `short_links` (`owner_module`,`owner_ref_id`);--> statement-breakpoint
CREATE INDEX `short_links_created_idx` ON `short_links` (`created_at`);--> statement-breakpoint
CREATE INDEX `short_links_expires_idx` ON `short_links` (`expires_at`);