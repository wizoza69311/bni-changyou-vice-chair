CREATE TABLE IF NOT EXISTS `letter_notification_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`notifications` text DEFAULT '[]' NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "letter_notification_state_id_check" CHECK (`id` = 1)
);
