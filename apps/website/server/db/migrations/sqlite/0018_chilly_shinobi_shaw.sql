PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`description` text,
	`reference_type` text,
	`reference_id` text,
	`checkout_session_id` text,
	`invoice_id` text,
	`payment_intent_id` text,
	`refunded_amount` integer DEFAULT 0 NOT NULL,
	`metadata` text,
	`items` text,
	`paid_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_payments`("id", "user_id", "status", "amount", "currency", "description", "reference_type", "reference_id", "checkout_session_id", "invoice_id", "payment_intent_id", "refunded_amount", "metadata", "items", "paid_at", "created_at", "updated_at") SELECT "id", "user_id", "status", "amount", "currency", "description", "reference_type", "reference_id", "checkout_session_id", NULL, "payment_intent_id", "refunded_amount", "metadata", "items", "paid_at", "created_at", "updated_at" FROM `payments`;--> statement-breakpoint
DROP TABLE `payments`;--> statement-breakpoint
ALTER TABLE `__new_payments` RENAME TO `payments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `payments_checkoutSessionId_unique` ON `payments` (`checkout_session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_invoiceId_unique` ON `payments` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `payment_user_idx` ON `payments` (`user_id`);--> statement-breakpoint
CREATE INDEX `payment_reference_idx` ON `payments` (`reference_type`,`reference_id`);--> statement-breakpoint
CREATE INDEX `payment_intent_idx` ON `payments` (`payment_intent_id`);