CREATE TABLE `form_access` (
	`formId` text PRIMARY KEY NOT NULL,
	`passwordHash` text NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`formId`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `form_access_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`formId` text NOT NULL,
	`name` text NOT NULL,
	`tokenHash` text NOT NULL,
	`prefix` text NOT NULL,
	`createdAt` integer NOT NULL,
	`lastUsedAt` integer,
	`revokedAt` integer,
	FOREIGN KEY (`formId`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `form_access_tokens_tokenHash_unique` ON `form_access_tokens` (`tokenHash`);--> statement-breakpoint
CREATE INDEX `form_access_token_form_idx` ON `form_access_tokens` (`formId`);
