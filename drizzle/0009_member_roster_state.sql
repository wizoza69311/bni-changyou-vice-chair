CREATE TABLE IF NOT EXISTS `member_roster_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`members` text DEFAULT '[]' NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "member_roster_state_id_check" CHECK (`id` = 1)
);
