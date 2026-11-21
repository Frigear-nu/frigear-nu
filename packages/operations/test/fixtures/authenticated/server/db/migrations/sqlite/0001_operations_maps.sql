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
CREATE INDEX `map_kind_idx` ON `maps` (`kind`);