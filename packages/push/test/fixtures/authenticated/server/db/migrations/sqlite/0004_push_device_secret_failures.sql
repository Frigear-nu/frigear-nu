ALTER TABLE `push_devices` ADD `secretHash` text;--> statement-breakpoint
ALTER TABLE `push_devices` ADD `failures` integer DEFAULT 0 NOT NULL;