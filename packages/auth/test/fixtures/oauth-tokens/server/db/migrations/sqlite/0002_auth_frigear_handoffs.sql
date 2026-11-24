CREATE TABLE `auth_frigear_handoffs` (
	`id` text PRIMARY KEY NOT NULL,
	`secretHash` text NOT NULL,
	`stateHash` text NOT NULL,
	`codeVerifier` text NOT NULL,
	`nonce` text NOT NULL,
	`redirectUri` text NOT NULL,
	`redirectTo` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`userId` integer,
	`sessionData` text,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_frigear_handoffs_stateHash_unique` ON `auth_frigear_handoffs` (`stateHash`);--> statement-breakpoint
CREATE INDEX `auth_frigear_handoffs_expires_idx` ON `auth_frigear_handoffs` (`expiresAt`);