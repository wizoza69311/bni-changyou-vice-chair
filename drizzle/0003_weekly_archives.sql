CREATE TABLE `weekly_archives` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`meeting_date` text NOT NULL,
	`title` text NOT NULL,
	`agenda` text DEFAULT '[]' NOT NULL,
	`checked` text DEFAULT '[]' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`renewals` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `weekly_archives_meeting_date_unique` ON `weekly_archives` (`meeting_date`);
CREATE INDEX `idx_weekly_archives_date` ON `weekly_archives` (`meeting_date`);
