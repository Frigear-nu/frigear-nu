ALTER TABLE `inbox_threads` ADD `preview` text;--> statement-breakpoint
CREATE INDEX `inbox_audit_contact_idx` ON `inbox_audit` (`contactId`);