CREATE TABLE IF NOT EXISTS `weekly_palms_reports` (
  `meeting_date` text PRIMARY KEY NOT NULL,
  `summary` text NOT NULL,
  `audit` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE TABLE IF NOT EXISTS `weekly_palms_reviews` (
  `key` text PRIMARY KEY NOT NULL,
  `meeting_date` text NOT NULL,
  `transaction_id` text NOT NULL,
  `checked` integer DEFAULT 0 NOT NULL,
  `note` text DEFAULT '' NOT NULL,
  `updated_at` text NOT NULL
);
CREATE INDEX IF NOT EXISTS `idx_weekly_palms_reviews_date` ON `weekly_palms_reviews` (`meeting_date`);
