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
CREATE TABLE `crew_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`operationId` text NOT NULL,
	`teamId` text NOT NULL,
	`role` text NOT NULL,
	`tokenHash` text NOT NULL,
	`prefix` text NOT NULL,
	`maxUses` integer DEFAULT 1 NOT NULL,
	`uses` integer DEFAULT 0 NOT NULL,
	`expiresAt` integer,
	`createdBy` integer,
	`createdAt` integer NOT NULL,
	`revokedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crew_invite_token_unique` ON `crew_invites` (`tokenHash`);--> statement-breakpoint
CREATE INDEX `crew_invite_operation_idx` ON `crew_invites` (`operationId`);--> statement-breakpoint
CREATE TABLE `crew_settings` (
	`operationId` text PRIMARY KEY NOT NULL,
	`formId` text,
	`defaultTeamId` text,
	`capacity` integer,
	`waitlist` integer DEFAULT true NOT NULL,
	`previousCrewFirst` integer DEFAULT false NOT NULL,
	`opensAt` integer,
	`closesAt` integer,
	`statusEmails` text,
	`presets` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
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
CREATE INDEX `form_access_token_form_idx` ON `form_access_tokens` (`formId`);--> statement-breakpoint
CREATE TABLE `form_secrets` (
	`formId` text PRIMARY KEY NOT NULL,
	`secrets` text NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`formId`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `form_submission_files` (
	`id` text PRIMARY KEY NOT NULL,
	`submissionId` text NOT NULL,
	`fieldKey` text NOT NULL,
	`pathname` text NOT NULL,
	`filename` text NOT NULL,
	`contentType` text NOT NULL,
	`size` integer NOT NULL,
	FOREIGN KEY (`submissionId`) REFERENCES `form_submissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `form_submission_file_submission_idx` ON `form_submission_files` (`submissionId`);--> statement-breakpoint
CREATE TABLE `form_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`formId` text NOT NULL,
	`formSlug` text NOT NULL,
	`formVersion` integer NOT NULL,
	`definitionSnapshot` text NOT NULL,
	`answers` text NOT NULL,
	`userId` integer,
	`locale` text DEFAULT 'en' NOT NULL,
	`deliveryStatus` text DEFAULT 'none' NOT NULL,
	`deliveryError` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`formId`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `form_submission_form_idx` ON `form_submissions` (`formId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `forms` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`definition` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `forms_slug_unique` ON `forms` (`slug`);--> statement-breakpoint
CREATE TABLE `operations` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`hostName` text,
	`hostUrl` text,
	`startsAt` integer NOT NULL,
	`endsAt` integer,
	`schedule` text,
	`location` text,
	`status` text DEFAULT 'planning' NOT NULL,
	`public` integer DEFAULT false NOT NULL,
	`eventId` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operations_slug_unique` ON `operations` (`slug`);--> statement-breakpoint
CREATE INDEX `operation_status_idx` ON `operations` (`status`);--> statement-breakpoint
CREATE INDEX `operation_starts_idx` ON `operations` (`startsAt`);--> statement-breakpoint
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
CREATE TABLE `shift_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`shiftId` text NOT NULL,
	`userId` integer NOT NULL,
	`shiftRoleId` text,
	`status` text DEFAULT 'assigned' NOT NULL,
	`checkInCode` text NOT NULL,
	`checkedInAt` integer,
	`checkedInBy` integer,
	`assignedBy` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shift_assignment_code_unique` ON `shift_assignments` (`checkInCode`);--> statement-breakpoint
CREATE INDEX `shift_assignment_shift_idx` ON `shift_assignments` (`shiftId`);--> statement-breakpoint
CREATE INDEX `shift_assignment_user_idx` ON `shift_assignments` (`userId`);--> statement-breakpoint
CREATE TABLE `shift_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`scheduleId` text NOT NULL,
	`teamId` text NOT NULL,
	`teamRole` text,
	`name` text NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shift_role_schedule_idx` ON `shift_roles` (`scheduleId`);--> statement-breakpoint
CREATE TABLE `shift_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`operationId` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`swapMode` text DEFAULT 'peer' NOT NULL,
	`minPerShift` integer,
	`maxPerShift` integer,
	`guards` text,
	`publishedAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shift_schedule_operation_idx` ON `shift_schedules` (`operationId`);--> statement-breakpoint
CREATE TABLE `shift_swap_offers` (
	`id` text PRIMARY KEY NOT NULL,
	`swapId` text NOT NULL,
	`userId` integer NOT NULL,
	`offeredAssignmentId` text,
	`status` text DEFAULT 'offered' NOT NULL,
	`decidedAt` integer,
	`approvedBy` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shift_swap_offer_swap_idx` ON `shift_swap_offers` (`swapId`);--> statement-breakpoint
CREATE INDEX `shift_swap_offer_user_idx` ON `shift_swap_offers` (`userId`);--> statement-breakpoint
CREATE TABLE `shift_swaps` (
	`id` text PRIMARY KEY NOT NULL,
	`assignmentId` text NOT NULL,
	`userId` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`openedAt` integer NOT NULL,
	`decidedAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shift_swap_assignment_idx` ON `shift_swaps` (`assignmentId`);--> statement-breakpoint
CREATE INDEX `shift_swap_status_idx` ON `shift_swaps` (`status`);--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`scheduleId` text NOT NULL,
	`teamId` text NOT NULL,
	`shiftRoleId` text,
	`startsAt` integer NOT NULL,
	`endsAt` integer NOT NULL,
	`location` text,
	`capacity` integer,
	`notes` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shift_schedule_start_idx` ON `shifts` (`scheduleId`,`startsAt`);--> statement-breakpoint
CREATE INDEX `shift_team_start_idx` ON `shifts` (`teamId`,`startsAt`);--> statement-breakpoint
CREATE TABLE `team_members` (
	`id` text PRIMARY KEY NOT NULL,
	`teamId` text NOT NULL,
	`userId` integer NOT NULL,
	`role` text NOT NULL,
	`status` text,
	`addedBy` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`crewStatus` text,
	`appliedAt` integer,
	`decidedAt` integer,
	`decidedBy` integer,
	`submissionId` text,
	`waitlistPosition` integer,
	`waitlistReason` text,
	`locale` text,
	FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_member_unique` ON `team_members` (`teamId`,`userId`);--> statement-breakpoint
CREATE INDEX `team_member_user_idx` ON `team_members` (`userId`);--> statement-breakpoint
CREATE TABLE `team_role_ladders` (
	`kind` text PRIMARY KEY NOT NULL,
	`roles` text NOT NULL,
	`leadFrom` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `team_role_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`ownerType` text NOT NULL,
	`ownerId` text,
	`teamId` text,
	`match` text NOT NULL,
	`teamRole` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `team_mapping_owner_idx` ON `team_role_mappings` (`ownerType`,`ownerId`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`ownerType` text NOT NULL,
	`ownerId` text,
	`parentId` text,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`capacity` integer,
	`sort` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `team_owner_idx` ON `teams` (`ownerType`,`ownerId`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`avatar` text,
	`accepted_terms_at` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`phone` text,
	`password` text,
	`emailVerifiedAt` integer,
	`lastLoginAt` integer,
	`sessionVersion` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);