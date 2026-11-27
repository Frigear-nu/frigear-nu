CREATE TABLE `campaign_clicks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`deliveryId` text NOT NULL,
	`linkId` text NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`deliveryId`) REFERENCES `campaign_deliveries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`linkId`) REFERENCES `campaign_links`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `campaign_click_delivery_idx` ON `campaign_clicks` (`deliveryId`);--> statement-breakpoint
CREATE INDEX `campaign_click_link_idx` ON `campaign_clicks` (`linkId`);--> statement-breakpoint
CREATE TABLE `campaign_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`campaignId` text NOT NULL,
	`channel` text NOT NULL,
	`userId` integer,
	`contactId` text,
	`subscriptionId` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`skipReason` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`claimId` text,
	`claimedAt` integer,
	`sentAt` integer,
	`openedAt` integer,
	`clickedAt` integer,
	`clicks` integer DEFAULT 0 NOT NULL,
	`error` text,
	FOREIGN KEY (`campaignId`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `campaign_delivery_status_idx` ON `campaign_deliveries` (`campaignId`,`status`);--> statement-breakpoint
CREATE INDEX `campaign_delivery_claim_idx` ON `campaign_deliveries` (`status`,`claimedAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_delivery_user_unique` ON `campaign_deliveries` (`campaignId`,`channel`,`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_delivery_contact_unique` ON `campaign_deliveries` (`campaignId`,`channel`,`contactId`);--> statement-breakpoint
CREATE TABLE `campaign_links` (
	`id` text PRIMARY KEY NOT NULL,
	`campaignId` text NOT NULL,
	`shortLinkId` text NOT NULL,
	`url` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`campaignId`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_link_unique` ON `campaign_links` (`campaignId`,`url`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_link_short_unique` ON `campaign_links` (`shortLinkId`);--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`channels` text NOT NULL,
	`audience` text NOT NULL,
	`content` text NOT NULL,
	`locale` text,
	`trackClicks` integer DEFAULT true NOT NULL,
	`trackOpens` integer DEFAULT false NOT NULL,
	`important` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`scheduledAt` integer,
	`startedAt` integer,
	`materializedAt` integer,
	`materializeCursor` text,
	`finishedAt` integer,
	`cancelledAt` integer,
	`recipientUserIds` text,
	`origin` text,
	`createdBy` integer,
	`sentBy` integer,
	`counts` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `campaign_status_idx` ON `campaigns` (`status`,`scheduledAt`);--> statement-breakpoint
CREATE INDEX `campaign_created_idx` ON `campaigns` (`createdAt`);--> statement-breakpoint
CREATE TABLE `short_link_clicks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`linkId` text NOT NULL,
	`at` integer NOT NULL,
	`subject` text,
	`referrerHost` text,
	FOREIGN KEY (`linkId`) REFERENCES `short_links`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `short_link_clicks_link_idx` ON `short_link_clicks` (`linkId`,`at`);--> statement-breakpoint
CREATE INDEX `short_link_clicks_at_idx` ON `short_link_clicks` (`at`);--> statement-breakpoint
CREATE TABLE `short_links` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`url` text NOT NULL,
	`ownerModule` text NOT NULL,
	`ownerRefId` text,
	`title` text,
	`track` integer DEFAULT true NOT NULL,
	`expiresAt` integer,
	`autoDelete` integer DEFAULT false NOT NULL,
	`disabledAt` integer,
	`clicks` integer DEFAULT 0 NOT NULL,
	`lastClickedAt` integer,
	`createdBy` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `short_links_code_idx` ON `short_links` (`code`);--> statement-breakpoint
CREATE INDEX `short_links_owner_idx` ON `short_links` (`ownerModule`,`ownerRefId`);--> statement-breakpoint
CREATE INDEX `short_links_created_idx` ON `short_links` (`createdAt`);--> statement-breakpoint
CREATE INDEX `short_links_expires_idx` ON `short_links` (`expiresAt`);--> statement-breakpoint
ALTER TABLE `users` ADD `preferences` text;