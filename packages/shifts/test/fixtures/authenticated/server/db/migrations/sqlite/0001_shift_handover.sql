ALTER TABLE `shift_schedules` ADD `coverage` text DEFAULT 'flexible' NOT NULL;--> statement-breakpoint
ALTER TABLE `shift_schedules` ADD `handover` text DEFAULT 'both' NOT NULL;--> statement-breakpoint
ALTER TABLE `shift_schedules` ADD `approval` text DEFAULT 'peer' NOT NULL;--> statement-breakpoint
UPDATE `shift_schedules` SET `approval` = CASE `swapMode` WHEN 'approval' THEN 'lead' ELSE 'peer' END;--> statement-breakpoint
ALTER TABLE `shift_schedules` DROP COLUMN `swapMode`;--> statement-breakpoint
ALTER TABLE `shift_swaps` ADD `kind` text DEFAULT 'release' NOT NULL;--> statement-breakpoint
ALTER TABLE `shift_swaps` ADD `wantedAssignmentId` text;
