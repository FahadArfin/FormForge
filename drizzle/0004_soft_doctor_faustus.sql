CREATE TABLE `community_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`model` text NOT NULL,
	`owner` text NOT NULL,
	`author` text NOT NULL,
	`body` text NOT NULL,
	`parent` text,
	`created` integer NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_community_comments_model` ON `community_comments` (`model`,`created`,`id`);--> statement-breakpoint
CREATE INDEX `idx_community_comments_owner` ON `community_comments` (`owner`);--> statement-breakpoint
CREATE INDEX `idx_community_comments_parent` ON `community_comments` (`parent`);--> statement-breakpoint
CREATE TABLE `community_models` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`tags` text NOT NULL,
	`license` text NOT NULL,
	`creator` text NOT NULL,
	`created` integer NOT NULL,
	`remix_of` text,
	`image` text,
	`document` text NOT NULL,
	`bytes` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_community_models_owner` ON `community_models` (`owner`);--> statement-breakpoint
CREATE INDEX `idx_community_models_created` ON `community_models` (`created`,`id`);--> statement-breakpoint
CREATE TABLE `community_writes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_community_writes_owner_created` ON `community_writes` (`owner`,`created`);