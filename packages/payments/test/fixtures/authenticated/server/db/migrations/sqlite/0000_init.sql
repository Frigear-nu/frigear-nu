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