CREATE TABLE `campaign_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`phone` text,
	`user_id` integer,
	`name` text,
	`locale` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_contact_email_unique` ON `campaign_contacts` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_contact_phone_unique` ON `campaign_contacts` (`phone`);--> statement-breakpoint
CREATE INDEX `campaign_contact_user_idx` ON `campaign_contacts` (`user_id`);--> statement-breakpoint
CREATE TABLE `campaign_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`channels` text NOT NULL,
	`double_opt_in` integer DEFAULT true NOT NULL,
	`public` integer DEFAULT true NOT NULL,
	`consent_text` text,
	`consent_version` integer DEFAULT 1 NOT NULL,
	`form_id` text,
	`form_fields` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_list_slug_unique` ON `campaign_lists` (`slug`);--> statement-breakpoint
CREATE TABLE `campaign_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`list_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`channel` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`confirm_token_hash` text,
	`confirm_expires_at` integer,
	`source` text NOT NULL,
	`consent_version` integer,
	`requested_at` integer NOT NULL,
	`confirmed_at` integer,
	`ip_hash` text,
	`unsubscribed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `campaign_lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `campaign_contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_subscription_unique` ON `campaign_subscriptions` (`list_id`,`contact_id`,`channel`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_subscription_confirm_unique` ON `campaign_subscriptions` (`confirm_token_hash`);--> statement-breakpoint
CREATE INDEX `campaign_subscription_list_status_idx` ON `campaign_subscriptions` (`list_id`,`status`);--> statement-breakpoint
CREATE INDEX `campaign_subscription_contact_idx` ON `campaign_subscriptions` (`contact_id`);