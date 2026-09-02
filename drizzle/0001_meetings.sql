CREATE TABLE `meetings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` text NOT NULL,
	`title` text NOT NULL,
	`meeting_date` text NOT NULL,
	`summary` text NOT NULL,
	`decisions` text DEFAULT '[]' NOT NULL,
	`action_candidates` text DEFAULT '[]' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meetings_source_id_unique` ON `meetings` (`source_id`);
--> statement-breakpoint
CREATE INDEX `idx_meetings_date` ON `meetings` (`meeting_date`);
