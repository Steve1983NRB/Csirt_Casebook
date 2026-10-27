CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`last_used_at` text,
	`revoked_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_api_keys_user` ON `api_keys` (`user_id`);
--> statement-breakpoint
CREATE TABLE `case_links` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`linked_case_id` text NOT NULL,
	`relation` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`author` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`),
	FOREIGN KEY (`linked_case_id`) REFERENCES `cases`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_case_links_pair` ON `case_links` (`case_id`,`linked_case_id`);
--> statement-breakpoint
CREATE INDEX `idx_case_links_target` ON `case_links` (`linked_case_id`);
--> statement-breakpoint
CREATE TABLE `user_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`author` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_groups_name` ON `user_groups` (lower(`name`));
--> statement-breakpoint
CREATE TABLE `group_members` (
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`group_id`, `user_id`),
	FOREIGN KEY (`group_id`) REFERENCES `user_groups`(`id`),
	FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_group_members_user` ON `group_members` (`user_id`);
--> statement-breakpoint
CREATE TABLE `case_group_access` (
	`case_id` text NOT NULL,
	`group_id` text NOT NULL,
	`role` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`case_id`, `group_id`),
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`),
	FOREIGN KEY (`group_id`) REFERENCES `user_groups`(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_case_group_access_group` ON `case_group_access` (`group_id`);
--> statement-breakpoint
CREATE VIEW `case_access` AS SELECT case_id,user_id,CASE MAX(lvl) WHEN 3 THEN 'reviewer' WHEN 2 THEN 'analyst' ELSE 'viewer' END AS role FROM (SELECT case_id,user_id,CASE role WHEN 'reviewer' THEN 3 WHEN 'analyst' THEN 2 WHEN 'viewer' THEN 1 ELSE 0 END AS lvl FROM case_memberships UNION ALL SELECT g.case_id,gm.user_id,CASE g.role WHEN 'reviewer' THEN 3 WHEN 'analyst' THEN 2 WHEN 'viewer' THEN 1 ELSE 0 END AS lvl FROM case_group_access g JOIN group_members gm ON gm.group_id=g.group_id) WHERE lvl>0 GROUP BY case_id,user_id;
--> statement-breakpoint
CREATE TABLE `datastore_files` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`folder` text DEFAULT '' NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`sha256` text NOT NULL,
	`size` integer NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`author` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_datastore_case` ON `datastore_files` (`case_id`,`folder`);
--> statement-breakpoint
CREATE TABLE `webhooks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`secret` text NOT NULL,
	`events` text NOT NULL,
	`include_case_details` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`author` text NOT NULL,
	`last_status` integer,
	`last_at` text,
	`last_error` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`webhook_id` text NOT NULL,
	`event` text NOT NULL,
	`status` integer,
	`ok` integer NOT NULL,
	`at` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`webhook_id`) REFERENCES `webhooks`(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_webhook_deliveries` ON `webhook_deliveries` (`webhook_id`,`at`);
--> statement-breakpoint
CREATE TABLE `case_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`author` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_case_templates_name` ON `case_templates` (lower(`name`));
--> statement-breakpoint
CREATE TABLE `attribute_defs` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`type` text NOT NULL,
	`options` text DEFAULT '[]' NOT NULL,
	`help` text DEFAULT '' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_attribute_defs_key` ON `attribute_defs` (`key`);
