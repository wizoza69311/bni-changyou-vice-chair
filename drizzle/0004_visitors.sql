CREATE TABLE `visitor_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`visitors` text DEFAULT '[]' NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "visitor_state_singleton" CHECK (`id` = 1)
);
ALTER TABLE `weekly_archives` ADD `visitors` text DEFAULT '[]' NOT NULL;
