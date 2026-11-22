ALTER TABLE `inbox_messages` ADD `contactId` text;--> statement-breakpoint
ALTER TABLE `inbox_messages` ADD `authenticated` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `inbox_message_contact_idx` ON `inbox_messages` (`contactId`);--> statement-breakpoint
ALTER TABLE `inbox_tombstones` ADD `contactId` text;--> statement-breakpoint
ALTER TABLE `inbox_tombstones` ADD `permanent` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `inbox_tombstone_contact_idx` ON `inbox_tombstones` (`contactId`);--> statement-breakpoint
-- Inbound messages stored before were sent by the contact of their thread.
UPDATE `inbox_messages` SET `contactId` = (SELECT `contactId` FROM `inbox_threads` WHERE `inbox_threads`.`id` = `inbox_messages`.`threadId`) WHERE `direction` = 'in';