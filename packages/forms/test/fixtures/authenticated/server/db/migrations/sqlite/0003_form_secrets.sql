CREATE TABLE `form_secrets` (
	`formId` text PRIMARY KEY NOT NULL,
	`secrets` text NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`formId`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade
);
