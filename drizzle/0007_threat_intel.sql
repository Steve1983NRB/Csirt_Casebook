CREATE TABLE `intel_items` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`source` text NOT NULL,
	`type` text NOT NULL,
	`value` text NOT NULL,
	`key` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`threat_type` text DEFAULT '' NOT NULL,
	`confidence` integer,
	`tags` text DEFAULT '[]' NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`data` text DEFAULT '{}' NOT NULL,
	`first_seen` text,
	`last_seen` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`author` text DEFAULT '' NOT NULL,
	`author_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_intel_unique` ON `intel_items` (`kind`,`source`,`key`);
--> statement-breakpoint
CREATE INDEX `idx_intel_key` ON `intel_items` (`kind`,`key`);
--> statement-breakpoint
CREATE INDEX `idx_intel_source_updated` ON `intel_items` (`source`,`updated_at`);
