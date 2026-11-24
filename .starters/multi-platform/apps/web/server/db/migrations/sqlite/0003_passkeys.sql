CREATE TABLE `user_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` integer NOT NULL,
	`publicKey` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`backedUp` integer DEFAULT false NOT NULL,
	`transports` text,
	`name` text,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `user_credential_user_idx` ON `user_credentials` (`userId`);