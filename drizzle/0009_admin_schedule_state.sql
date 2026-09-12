CREATE TABLE IF NOT EXISTS `admin_schedule_state` (
  `id` integer PRIMARY KEY NOT NULL,
  `schedules` text DEFAULT '[]' NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT "admin_schedule_state_singleton" CHECK (`id` = 1)
);
