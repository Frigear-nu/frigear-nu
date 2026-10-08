CREATE TABLE `event_addon_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_type_id` text NOT NULL,
	`title` text NOT NULL,
	`required` integer DEFAULT false NOT NULL,
	`multiple` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`ticket_type_id`) REFERENCES `event_ticket_types`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_addon_group_ticket_idx` ON `event_addon_groups` (`ticket_type_id`);--> statement-breakpoint
CREATE TABLE `event_addons` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`price` integer DEFAULT 0 NOT NULL,
	`capacity` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `event_addon_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_addon_group_idx` ON `event_addons` (`group_id`);--> statement-breakpoint
CREATE TABLE `event_ticket_types` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`price` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'DKK' NOT NULL,
	`hide_price` integer DEFAULT false NOT NULL,
	`capacity` integer,
	`sale_starts_at` integer,
	`sale_ends_at` integer,
	`max_per_user` integer DEFAULT 1 NOT NULL,
	`requires_membership` text,
	`is_default` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_ticket_type_key_idx` ON `event_ticket_types` (`event_id`,`key`);--> statement-breakpoint
CREATE TABLE `event_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`ticket_type_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`payment_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`addons` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`code` text NOT NULL,
	`checked_in_at` integer,
	`checked_in_by` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_tickets_code_unique` ON `event_tickets` (`code`);--> statement-breakpoint
CREATE INDEX `event_ticket_event_idx` ON `event_tickets` (`event_id`,`status`);--> statement-breakpoint
CREATE INDEX `event_ticket_user_idx` ON `event_tickets` (`user_id`);--> statement-breakpoint
CREATE INDEX `event_ticket_payment_idx` ON `event_tickets` (`payment_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`body` text,
	`image` text,
	`location` text,
	`location_url` text,
	`starts_at` integer NOT NULL,
	`ends_at` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`requires_membership` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_slug_unique` ON `events` (`slug`);--> statement-breakpoint
CREATE INDEX `event_status_starts_idx` ON `events` (`status`,`starts_at`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`description` text,
	`reference_type` text,
	`reference_id` text,
	`checkout_session_id` text NOT NULL,
	`payment_intent_id` text,
	`refunded_amount` integer DEFAULT 0 NOT NULL,
	`metadata` text,
	`paid_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_checkoutSessionId_unique` ON `payments` (`checkout_session_id`);--> statement-breakpoint
CREATE INDEX `payment_user_idx` ON `payments` (`user_id`);--> statement-breakpoint
CREATE INDEX `payment_reference_idx` ON `payments` (`reference_type`,`reference_id`);--> statement-breakpoint
CREATE INDEX `payment_intent_idx` ON `payments` (`payment_intent_id`);