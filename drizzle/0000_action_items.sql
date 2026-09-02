CREATE TABLE `action_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`owner` text DEFAULT '' NOT NULL,
	`due_date` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`meeting_title` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_action_items_status_due` ON `action_items` (`status`,`due_date`);
