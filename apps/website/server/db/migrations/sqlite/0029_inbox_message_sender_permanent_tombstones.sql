ALTER TABLE `inbox_messages` ADD `contact_id` text;--> statement-breakpoint
ALTER TABLE `inbox_messages` ADD `authenticated` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `inbox_message_contact_idx` ON `inbox_messages` (`contact_id`);--> statement-breakpoint
ALTER TABLE `inbox_tombstones` ADD `contact_id` text;--> statement-breakpoint
ALTER TABLE `inbox_tombstones` ADD `permanent` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `inbox_tombstone_contact_idx` ON `inbox_tombstones` (`contact_id`);--> statement-breakpoint
-- Inbound messages stored before were sent by the contact of their thread.
UPDATE `inbox_messages` SET `contact_id` = (SELECT `contact_id` FROM `inbox_threads` WHERE `inbox_threads`.`id` = `inbox_messages`.`thread_id`) WHERE `direction` = 'in';