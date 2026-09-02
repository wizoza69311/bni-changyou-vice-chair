CREATE TABLE `practice_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`renewals` text DEFAULT '[]' NOT NULL,
	`tasks` text DEFAULT '[]' NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "practice_state_singleton" CHECK (`id` = 1)
);
