CREATE TABLE IF NOT EXISTS `member_kpi_state` (
	`member` text PRIMARY KEY NOT NULL,
	`training_points` integer,
	`visitor_count` integer,
	`one_to_one_weekly_average` real,
	`referral_weekly_average` real,
	`dream_referral_amount` integer,
	`updated_at` text NOT NULL
);
