PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`description` text,
	`referenceType` text,
	`referenceId` text,
	`checkoutSessionId` text,
	`invoiceId` text,
	`paymentIntentId` text,
	`refundedAmount` integer DEFAULT 0 NOT NULL,
	`metadata` text,
	`items` text,
	`paidAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_payments`("id", "userId", "status", "amount", "currency", "description", "referenceType", "referenceId", "checkoutSessionId", "invoiceId", "paymentIntentId", "refundedAmount", "metadata", "items", "paidAt", "createdAt", "updatedAt") SELECT "id", "userId", "status", "amount", "currency", "description", "referenceType", "referenceId", "checkoutSessionId", NULL, "paymentIntentId", "refundedAmount", "metadata", "items", "paidAt", "createdAt", "updatedAt" FROM `payments`;--> statement-breakpoint
DROP TABLE `payments`;--> statement-breakpoint
ALTER TABLE `__new_payments` RENAME TO `payments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `payments_checkoutSessionId_unique` ON `payments` (`checkoutSessionId`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_invoiceId_unique` ON `payments` (`invoiceId`);--> statement-breakpoint
CREATE INDEX `payment_user_idx` ON `payments` (`userId`);--> statement-breakpoint
CREATE INDEX `payment_reference_idx` ON `payments` (`referenceType`,`referenceId`);--> statement-breakpoint
CREATE INDEX `payment_intent_idx` ON `payments` (`paymentIntentId`);