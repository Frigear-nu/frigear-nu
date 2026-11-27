CREATE TABLE `campaign_clicks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`link_id` text NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`delivery_id`) REFERENCES `campaign_deliveries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`link_id`) REFERENCES `campaign_links`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `campaign_click_delivery_idx` ON `campaign_clicks` (`delivery_id`);--> statement-breakpoint
CREATE INDEX `campaign_click_link_idx` ON `campaign_clicks` (`link_id`);--> statement-breakpoint
CREATE TABLE `campaign_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`channel` text NOT NULL,
	`user_id` integer,
	`contact_id` text,
	`subscription_id` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`skip_reason` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`claim_id` text,
	`claimed_at` integer,
	`sent_at` integer,
	`opened_at` integer,
	`clicked_at` integer,
	`clicks` integer DEFAULT 0 NOT NULL,
	`error` text,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `campaign_delivery_status_idx` ON `campaign_deliveries` (`campaign_id`,`status`);--> statement-breakpoint
CREATE INDEX `campaign_delivery_claim_idx` ON `campaign_deliveries` (`status`,`claimed_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_delivery_user_unique` ON `campaign_deliveries` (`campaign_id`,`channel`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_delivery_contact_unique` ON `campaign_deliveries` (`campaign_id`,`channel`,`contact_id`);--> statement-breakpoint
CREATE TABLE `campaign_links` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`short_link_id` text NOT NULL,
	`url` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_link_unique` ON `campaign_links` (`campaign_id`,`url`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_link_short_unique` ON `campaign_links` (`short_link_id`);--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`channels` text NOT NULL,
	`audience` text NOT NULL,
	`content` text NOT NULL,
	`locale` text,
	`track_clicks` integer DEFAULT true NOT NULL,
	`track_opens` integer DEFAULT false NOT NULL,
	`important` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`scheduled_at` integer,
	`started_at` integer,
	`materialized_at` integer,
	`materialize_cursor` text,
	`finished_at` integer,
	`cancelled_at` integer,
	`recipient_user_ids` text,
	`origin` text,
	`created_by` integer,
	`sent_by` integer,
	`counts` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `campaign_status_idx` ON `campaigns` (`status`,`scheduled_at`);--> statement-breakpoint
CREATE INDEX `campaign_created_idx` ON `campaigns` (`created_at`);