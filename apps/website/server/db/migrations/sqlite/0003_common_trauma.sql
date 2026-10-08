CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`plan_key` text,
	`price_id` text NOT NULL,
	`status` text NOT NULL,
	`cancel_at_period_end` integer DEFAULT false NOT NULL,
	`current_period_start` integer,
	`current_period_end` integer,
	`ended_at` integer,
	`raw_items` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `subscription_user_idx` ON `subscriptions` (`user_id`);