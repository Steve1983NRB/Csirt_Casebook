CREATE TABLE `auth_login_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`window_started_at` text NOT NULL,
	`attempts` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_auth_login_limits_window` ON `auth_login_limits` (`window_started_at`);
