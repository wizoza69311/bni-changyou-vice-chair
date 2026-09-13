CREATE TABLE IF NOT EXISTS `attendance_alert_ack_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`acknowledgements` text DEFAULT '[]' NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "attendance_alert_ack_state_id_check" CHECK (`id` = 1)
);
