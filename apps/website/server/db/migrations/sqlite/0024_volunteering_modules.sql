CREATE TABLE `crew_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`operation_id` text NOT NULL,
	`team_id` text NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`max_uses` integer DEFAULT 1 NOT NULL,
	`uses` integer DEFAULT 0 NOT NULL,
	`expires_at` integer,
	`created_by` integer,
	`created_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crew_invite_token_unique` ON `crew_invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `crew_invite_operation_idx` ON `crew_invites` (`operation_id`);--> statement-breakpoint
CREATE TABLE `crew_settings` (
	`operation_id` text PRIMARY KEY NOT NULL,
	`form_id` text,
	`default_team_id` text,
	`capacity` integer,
	`waitlist` integer DEFAULT true NOT NULL,
	`previous_crew_first` integer DEFAULT false NOT NULL,
	`opens_at` integer,
	`closes_at` integer,
	`status_emails` text,
	`presets` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `help_articles` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`search_text` text DEFAULT '' NOT NULL,
	`search_body` text DEFAULT '' NOT NULL,
	`icon` text,
	`links` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`grants` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`published_at` integer,
	`updated_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `help_categories`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `help_articles_slug_unique` ON `help_articles` (`slug`);--> statement-breakpoint
CREATE INDEX `help_article_category_status_idx` ON `help_articles` (`category_id`,`status`);--> statement-breakpoint
CREATE TABLE `help_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`parent_id` text,
	`owner_type` text DEFAULT 'platform' NOT NULL,
	`owner_id` text,
	`grants` text DEFAULT '[]' NOT NULL,
	`kind` text DEFAULT 'help' NOT NULL,
	`display` text DEFAULT 'list' NOT NULL,
	`icon` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `help_categories_slug_unique` ON `help_categories` (`slug`);--> statement-breakpoint
CREATE INDEX `help_category_owner_idx` ON `help_categories` (`owner_type`,`owner_id`);--> statement-breakpoint
CREATE INDEX `help_category_parent_idx` ON `help_categories` (`parent_id`);--> statement-breakpoint
CREATE TABLE `help_checklist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`checklist_id` text NOT NULL,
	`article_id` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`required` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`checklist_id`) REFERENCES `help_checklists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `help_checklist_item_article_idx` ON `help_checklist_items` (`checklist_id`,`article_id`);--> statement-breakpoint
CREATE INDEX `help_checklist_item_sort_idx` ON `help_checklist_items` (`checklist_id`,`sort`);--> statement-breakpoint
CREATE TABLE `help_checklists` (
	`id` text PRIMARY KEY NOT NULL,
	`operation_id` text,
	`name` text NOT NULL,
	`grants` text DEFAULT '[]' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `help_checklist_operation_idx` ON `help_checklists` (`operation_id`);--> statement-breakpoint
CREATE TABLE `help_reads` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`article_id` text NOT NULL,
	`read_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `help_read_user_article_idx` ON `help_reads` (`user_id`,`article_id`);--> statement-breakpoint
CREATE INDEX `help_read_article_idx` ON `help_reads` (`article_id`);--> statement-breakpoint
CREATE TABLE `inbox_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text,
	`mailbox_id` text,
	`contact_id` text,
	`actor_id` integer,
	`action` text NOT NULL,
	`data` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inbox_audit_thread_idx` ON `inbox_audit` (`thread_id`);--> statement-breakpoint
CREATE INDEX `inbox_audit_contact_idx` ON `inbox_audit` (`contact_id`);--> statement-breakpoint
CREATE INDEX `inbox_audit_mailbox_idx` ON `inbox_audit` (`mailbox_id`);--> statement-breakpoint
CREATE INDEX `inbox_audit_created_idx` ON `inbox_audit` (`created_at`);--> statement-breakpoint
CREATE TABLE `inbox_channel_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_id` text NOT NULL,
	`channel` text NOT NULL,
	`address` text NOT NULL,
	`config` text NOT NULL,
	`secret_ref` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `inbox_mailboxes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inbox_channel_address_idx` ON `inbox_channel_accounts` (`channel`,`address`);--> statement-breakpoint
CREATE INDEX `inbox_channel_mailbox_idx` ON `inbox_channel_accounts` (`mailbox_id`);--> statement-breakpoint
CREATE TABLE `inbox_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text NOT NULL,
	`external_id` text NOT NULL,
	`name` text,
	`email` text,
	`phone` text,
	`user_id` integer,
	`erased_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inbox_contact_external_idx` ON `inbox_contacts` (`channel`,`external_id`);--> statement-breakpoint
CREATE INDEX `inbox_contact_user_idx` ON `inbox_contacts` (`user_id`);--> statement-breakpoint
CREATE TABLE `inbox_mailboxes` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text,
	`name` text NOT NULL,
	`grants` text DEFAULT '[]' NOT NULL,
	`retention_days` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inbox_mailboxes_key_unique` ON `inbox_mailboxes` (`key`);--> statement-breakpoint
CREATE INDEX `inbox_mailbox_owner_idx` ON `inbox_mailboxes` (`owner_type`,`owner_id`);--> statement-breakpoint
CREATE TABLE `inbox_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`direction` text NOT NULL,
	`author_id` integer,
	`body` text NOT NULL,
	`attachments` text NOT NULL,
	`cc` text,
	`channel_account_id` text,
	`external_id` text,
	`contact_id` text,
	`authenticated` integer DEFAULT false NOT NULL,
	`created_at_ms` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `inbox_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `inbox_message_thread_idx` ON `inbox_messages` (`thread_id`,`created_at_ms`);--> statement-breakpoint
CREATE UNIQUE INDEX `inbox_message_external_idx` ON `inbox_messages` (`channel_account_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `inbox_message_contact_idx` ON `inbox_messages` (`contact_id`);--> statement-breakpoint
CREATE TABLE `inbox_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`channel_account_id` text,
	`channel` text NOT NULL,
	`subject` text,
	`search_text` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`assignee_id` integer,
	`hidden_below` text,
	`preview` text,
	`last_message_at` integer NOT NULL,
	`anonymised_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `inbox_mailboxes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `inbox_contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`channel_account_id`) REFERENCES `inbox_channel_accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `inbox_thread_mailbox_idx` ON `inbox_threads` (`mailbox_id`,`status`);--> statement-breakpoint
CREATE INDEX `inbox_thread_assignee_idx` ON `inbox_threads` (`assignee_id`);--> statement-breakpoint
CREATE INDEX `inbox_thread_contact_idx` ON `inbox_threads` (`contact_id`);--> statement-breakpoint
CREATE INDEX `inbox_thread_last_idx` ON `inbox_threads` (`last_message_at`);--> statement-breakpoint
CREATE TABLE `inbox_tombstones` (
	`key` text PRIMARY KEY NOT NULL,
	`contact_id` text,
	`permanent` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inbox_tombstone_created_idx` ON `inbox_tombstones` (`created_at`);--> statement-breakpoint
CREATE INDEX `inbox_tombstone_contact_idx` ON `inbox_tombstones` (`contact_id`);--> statement-breakpoint
CREATE TABLE `operations` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`search_text` text DEFAULT '' NOT NULL,
	`description` text,
	`host_name` text,
	`host_url` text,
	`starts_at` integer NOT NULL,
	`ends_at` integer,
	`schedule` text,
	`location` text,
	`venue_layout` text,
	`status` text DEFAULT 'planning' NOT NULL,
	`public` integer DEFAULT false NOT NULL,
	`event_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operations_slug_unique` ON `operations` (`slug`);--> statement-breakpoint
CREATE INDEX `operation_status_idx` ON `operations` (`status`);--> statement-breakpoint
CREATE INDEX `operation_starts_idx` ON `operations` (`starts_at`);--> statement-breakpoint
CREATE TABLE `push_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`platform` text NOT NULL,
	`token` text NOT NULL,
	`provider` text,
	`app_id` text,
	`locale` text,
	`last_seen_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`revoked_at` integer,
	`secret_hash` text,
	`failures` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_devices_token_unique` ON `push_devices` (`token`);--> statement-breakpoint
CREATE INDEX `push_device_user_idx` ON `push_devices` (`user_id`);--> statement-breakpoint
CREATE TABLE `shift_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`shift_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`shift_role_id` text,
	`status` text DEFAULT 'assigned' NOT NULL,
	`check_in_code` text NOT NULL,
	`checked_in_at` integer,
	`checked_in_by` integer,
	`check_in_method` text,
	`assigned_by` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shift_assignment_code_unique` ON `shift_assignments` (`check_in_code`);--> statement-breakpoint
CREATE INDEX `shift_assignment_shift_idx` ON `shift_assignments` (`shift_id`);--> statement-breakpoint
CREATE INDEX `shift_assignment_user_idx` ON `shift_assignments` (`user_id`);--> statement-breakpoint
CREATE TABLE `shift_broadcasts` (
	`id` text PRIMARY KEY NOT NULL,
	`operation_id` text NOT NULL,
	`team_id` text,
	`shift_id` text,
	`team_role` text,
	`channels` text NOT NULL,
	`subject` text NOT NULL,
	`message` text NOT NULL,
	`recipient_count` integer NOT NULL,
	`sent_by` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shift_broadcast_operation_idx` ON `shift_broadcasts` (`operation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `shift_digest_items` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`assignment_id` text NOT NULL,
	`team_id` text NOT NULL,
	`sent_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shift_digest_item_unique` ON `shift_digest_items` (`kind`,`assignment_id`);--> statement-breakpoint
CREATE TABLE `shift_earned_perks` (
	`id` text PRIMARY KEY NOT NULL,
	`perk_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`voucher_type` text NOT NULL,
	`quantity` integer NOT NULL,
	`earned_at` integer NOT NULL,
	`claimed_at` integer,
	`claim_client` text,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shift_earned_perk_unique` ON `shift_earned_perks` (`perk_id`,`assignment_id`);--> statement-breakpoint
CREATE INDEX `shift_earned_perk_user_idx` ON `shift_earned_perks` (`user_id`,`claimed_at`);--> statement-breakpoint
CREATE INDEX `shift_earned_perk_assignment_idx` ON `shift_earned_perks` (`assignment_id`);--> statement-breakpoint
CREATE TABLE `shift_feed_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shift_feed_token_hash_unique` ON `shift_feed_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `shift_feed_token_user_idx` ON `shift_feed_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `shift_perks` (
	`id` text PRIMARY KEY NOT NULL,
	`operation_id` text NOT NULL,
	`team_id` text,
	`name` text NOT NULL,
	`voucher_type` text DEFAULT '' NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shift_perk_operation_idx` ON `shift_perks` (`operation_id`);--> statement-breakpoint
CREATE TABLE `shift_reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`assignment_id` text NOT NULL,
	`offset_minutes` integer NOT NULL,
	`user_id` integer NOT NULL,
	`sent_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shift_reminder_unique` ON `shift_reminders` (`assignment_id`,`offset_minutes`);--> statement-breakpoint
CREATE TABLE `shift_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`schedule_id` text NOT NULL,
	`team_id` text NOT NULL,
	`team_role` text,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shift_role_schedule_idx` ON `shift_roles` (`schedule_id`);--> statement-breakpoint
CREATE TABLE `shift_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`operation_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`coverage` text DEFAULT 'flexible' NOT NULL,
	`handover` text DEFAULT 'both' NOT NULL,
	`approval` text DEFAULT 'peer' NOT NULL,
	`min_per_shift` integer,
	`max_per_shift` integer,
	`guards` text,
	`check_in` text,
	`auto_no_show` integer DEFAULT false NOT NULL,
	`auto_no_show_minutes` integer DEFAULT 30 NOT NULL,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shift_schedule_operation_idx` ON `shift_schedules` (`operation_id`);--> statement-breakpoint
CREATE TABLE `shift_stations` (
	`id` text PRIMARY KEY NOT NULL,
	`schedule_id` text NOT NULL,
	`team_id` text NOT NULL,
	`name` text NOT NULL,
	`feature_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shift_station_schedule_idx` ON `shift_stations` (`schedule_id`);--> statement-breakpoint
CREATE TABLE `shift_swap_offers` (
	`id` text PRIMARY KEY NOT NULL,
	`swap_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`offered_assignment_id` text,
	`status` text DEFAULT 'offered' NOT NULL,
	`decided_at` integer,
	`approved_by` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shift_swap_offer_swap_idx` ON `shift_swap_offers` (`swap_id`);--> statement-breakpoint
CREATE INDEX `shift_swap_offer_user_idx` ON `shift_swap_offers` (`user_id`);--> statement-breakpoint
CREATE TABLE `shift_swaps` (
	`id` text PRIMARY KEY NOT NULL,
	`assignment_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`kind` text DEFAULT 'release' NOT NULL,
	`wanted_assignment_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`opened_at` integer NOT NULL,
	`decided_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shift_swap_assignment_idx` ON `shift_swaps` (`assignment_id`);--> statement-breakpoint
CREATE INDEX `shift_swap_status_idx` ON `shift_swaps` (`status`);--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`schedule_id` text NOT NULL,
	`team_id` text NOT NULL,
	`shift_role_id` text,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`location` text,
	`capacity` integer,
	`notes` text,
	`closed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shift_end_closed_idx` ON `shifts` (`ends_at`,`closed_at`);--> statement-breakpoint
CREATE INDEX `shift_schedule_start_idx` ON `shifts` (`schedule_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `shift_team_start_idx` ON `shifts` (`team_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `team_members` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`role` text NOT NULL,
	`status` text,
	`added_by` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`crew_status` text,
	`applied_at` integer,
	`decided_at` integer,
	`decided_by` integer,
	`submission_id` text,
	`waitlist_position` integer,
	`waitlist_reason` text,
	`locale` text,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_member_unique` ON `team_members` (`team_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `team_member_user_idx` ON `team_members` (`user_id`);--> statement-breakpoint
CREATE INDEX `team_member_submission_idx` ON `team_members` (`submission_id`);--> statement-breakpoint
CREATE INDEX `team_member_crew_status_idx` ON `team_members` (`crew_status`);--> statement-breakpoint
CREATE TABLE `team_role_ladders` (
	`kind` text PRIMARY KEY NOT NULL,
	`roles` text NOT NULL,
	`lead_from` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `team_role_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text,
	`team_id` text,
	`match` text NOT NULL,
	`team_role` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `team_mapping_owner_idx` ON `team_role_mappings` (`owner_type`,`owner_id`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text,
	`parent_id` text,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`search_text` text DEFAULT '' NOT NULL,
	`description` text,
	`capacity` integer,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `team_owner_idx` ON `teams` (`owner_type`,`owner_id`);
