CREATE TABLE `alert_inbox` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`status` text NOT NULL,
	`case_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`author` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_alert_inbox_status` ON `alert_inbox` (`status`,`updated_at`);