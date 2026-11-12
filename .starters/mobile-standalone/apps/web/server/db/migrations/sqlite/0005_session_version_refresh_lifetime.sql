ALTER TABLE `oauth_applications` ADD `refreshIdleTtl` integer;--> statement-breakpoint
ALTER TABLE `oauth_applications` ADD `refreshMaxAge` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `sessionVersion` integer DEFAULT 0 NOT NULL;