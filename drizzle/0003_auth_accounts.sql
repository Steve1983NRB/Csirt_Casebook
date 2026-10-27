ALTER TABLE `app_users` ADD `password_hash` text;--> statement-breakpoint
ALTER TABLE `app_users` ADD `mfa_secret` text;--> statement-breakpoint
ALTER TABLE `app_users` ADD `mfa_enabled` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `app_users` ADD `is_admin` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `app_users` ADD `created_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_app_users_email` ON `app_users` (lower(`email`));--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`mfa_pending` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_auth_sessions_user` ON `auth_sessions` (`user_id`);
