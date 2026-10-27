CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`contact_name` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_clients_owner_name` ON `clients` (`owner_id`,`name`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_clients_owner_name_unique` ON `clients` (`owner_id`,lower(`name`));
--> statement-breakpoint
CREATE TABLE `case_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL REFERENCES `cases`(`id`),
	`record_id` text REFERENCES `records`(`id`),
	`body` text NOT NULL,
	`mentions` text NOT NULL,
	`author_id` text NOT NULL,
	`author` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_comments_case_created` ON `case_comments` (`case_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `ioc_files` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL REFERENCES `cases`(`id`),
	`record_id` text NOT NULL REFERENCES `records`(`id`),
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`sha256` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ioc_files_case` ON `ioc_files` (`case_id`);
--> statement-breakpoint
CREATE INDEX `idx_ioc_files_record` ON `ioc_files` (`record_id`);
