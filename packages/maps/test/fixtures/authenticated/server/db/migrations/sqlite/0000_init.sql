CREATE TABLE `auth_user_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`name` text NOT NULL,
	`tokenHash` text NOT NULL,
	`prefix` text NOT NULL,
	`last4` text NOT NULL,
	`scopes` text NOT NULL,
	`permissions` text,
	`expiresAt` integer,
	`lastUsedAt` integer,
	`revokedAt` integer,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_user_tokens_tokenHash_unique` ON `auth_user_tokens` (`tokenHash`);--> statement-breakpoint
CREATE INDEX `auth_user_tokens_user_idx` ON `auth_user_tokens` (`userId`);--> statement-breakpoint
CREATE TABLE `map_features` (
	`id` text PRIMARY KEY NOT NULL,
	`mapId` text NOT NULL,
	`layerId` text NOT NULL,
	`featureKind` text NOT NULL,
	`geometry` text NOT NULL,
	`properties` text NOT NULL,
	`label` text,
	`linkMapId` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`mapId`) REFERENCES `maps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`layerId`) REFERENCES `map_layers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `map_feature_map_idx` ON `map_features` (`mapId`);--> statement-breakpoint
CREATE INDEX `map_feature_layer_idx` ON `map_features` (`layerId`);--> statement-breakpoint
CREATE TABLE `map_layers` (
	`id` text PRIMARY KEY NOT NULL,
	`mapId` text NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`visible` integer DEFAULT true NOT NULL,
	`editable` integer DEFAULT true NOT NULL,
	`visibility` text,
	FOREIGN KEY (`mapId`) REFERENCES `maps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `map_layer_key_idx` ON `map_layers` (`mapId`,`key`);--> statement-breakpoint
CREATE TABLE `maps` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text,
	`kind` text NOT NULL,
	`base` text NOT NULL,
	`ownerType` text NOT NULL,
	`ownerId` text,
	`name` text NOT NULL,
	`view` text NOT NULL,
	`underlay` text,
	`visibility` text,
	`source` text DEFAULT 'admin' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `maps_key_unique` ON `maps` (`key`);--> statement-breakpoint
CREATE INDEX `map_owner_idx` ON `maps` (`ownerType`,`ownerId`);--> statement-breakpoint
CREATE INDEX `map_kind_idx` ON `maps` (`kind`);--> statement-breakpoint
CREATE TABLE `password_resets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`code` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`usedAt` integer,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `password_resets_code_unique` ON `password_resets` (`code`);--> statement-breakpoint
CREATE INDEX `password_reset_user_idx` ON `password_resets` (`userId`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`avatar` text,
	`accepted_terms_at` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`password` text,
	`emailVerifiedAt` integer,
	`lastLoginAt` integer,
	`sessionVersion` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);