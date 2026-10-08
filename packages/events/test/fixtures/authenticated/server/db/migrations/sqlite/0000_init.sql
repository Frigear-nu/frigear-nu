CREATE TABLE `event_addon_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`ticketTypeId` text NOT NULL,
	`title` text NOT NULL,
	`required` integer DEFAULT false NOT NULL,
	`multiple` integer DEFAULT false NOT NULL,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`ticketTypeId`) REFERENCES `event_ticket_types`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_addon_group_ticket_idx` ON `event_addon_groups` (`ticketTypeId`);--> statement-breakpoint
CREATE TABLE `event_addons` (
	`id` text PRIMARY KEY NOT NULL,
	`groupId` text NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`price` integer DEFAULT 0 NOT NULL,
	`capacity` integer,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`groupId`) REFERENCES `event_addon_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_addon_group_idx` ON `event_addons` (`groupId`);--> statement-breakpoint
CREATE TABLE `event_ticket_types` (
	`id` text PRIMARY KEY NOT NULL,
	`eventId` text NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`price` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'DKK' NOT NULL,
	`hidePrice` integer DEFAULT false NOT NULL,
	`capacity` integer,
	`saleStartsAt` integer,
	`saleEndsAt` integer,
	`maxPerUser` integer DEFAULT 1 NOT NULL,
	`requiresMembership` text,
	`isDefault` integer DEFAULT false NOT NULL,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`eventId`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_ticket_type_key_idx` ON `event_ticket_types` (`eventId`,`key`);--> statement-breakpoint
CREATE TABLE `event_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`eventId` text NOT NULL,
	`ticketTypeId` text NOT NULL,
	`userId` integer NOT NULL,
	`paymentId` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`addons` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`code` text NOT NULL,
	`checkedInAt` integer,
	`checkedInBy` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_tickets_code_unique` ON `event_tickets` (`code`);--> statement-breakpoint
CREATE INDEX `event_ticket_event_idx` ON `event_tickets` (`eventId`,`status`);--> statement-breakpoint
CREATE INDEX `event_ticket_user_idx` ON `event_tickets` (`userId`);--> statement-breakpoint
CREATE INDEX `event_ticket_payment_idx` ON `event_tickets` (`paymentId`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`body` text,
	`image` text,
	`location` text,
	`locationUrl` text,
	`startsAt` integer NOT NULL,
	`endsAt` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`requiresMembership` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_slug_unique` ON `events` (`slug`);--> statement-breakpoint
CREATE INDEX `event_status_starts_idx` ON `events` (`status`,`startsAt`);--> statement-breakpoint
CREATE TABLE `password_resets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`code` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`usedAt` integer,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `password_resets_code_unique` ON `password_resets` (`code`);--> statement-breakpoint
CREATE INDEX `password_reset_user_idx` ON `password_resets` (`userId`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`description` text,
	`referenceType` text,
	`referenceId` text,
	`checkoutSessionId` text NOT NULL,
	`paymentIntentId` text,
	`refundedAmount` integer DEFAULT 0 NOT NULL,
	`metadata` text,
	`paidAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_checkoutSessionId_unique` ON `payments` (`checkoutSessionId`);--> statement-breakpoint
CREATE INDEX `payment_user_idx` ON `payments` (`userId`);--> statement-breakpoint
CREATE INDEX `payment_reference_idx` ON `payments` (`referenceType`,`referenceId`);--> statement-breakpoint
CREATE INDEX `payment_intent_idx` ON `payments` (`paymentIntentId`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` integer NOT NULL,
	`planKey` text,
	`priceId` text NOT NULL,
	`status` text NOT NULL,
	`cancelAtPeriodEnd` integer DEFAULT false NOT NULL,
	`currentPeriodStart` integer,
	`currentPeriodEnd` integer,
	`endedAt` integer,
	`rawItems` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `subscription_user_idx` ON `subscriptions` (`userId`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password` text,
	`avatar` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`stripe_customer_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);