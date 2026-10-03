CREATE TABLE `cloud_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`project` text NOT NULL,
	`revision` integer NOT NULL,
	`author` text NOT NULL,
	`body` text NOT NULL,
	`parent` text,
	`resolved` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_cloud_comments_project` ON `cloud_comments` (`project`,`created`);--> statement-breakpoint
CREATE TABLE `cloud_members` (
	`project` text NOT NULL,
	`user` text NOT NULL,
	`grant` text NOT NULL,
	PRIMARY KEY(`project`, `user`)
);
--> statement-breakpoint
CREATE INDEX `idx_cloud_members_user` ON `cloud_members` (`user`);--> statement-breakpoint
CREATE TABLE `cloud_preferences` (
	`user` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cloud_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`revision` integer NOT NULL,
	`blob` text NOT NULL,
	`updated` integer NOT NULL,
	`share_hash` text,
	`share_expires` integer
);
--> statement-breakpoint
CREATE INDEX `idx_cloud_projects_owner` ON `cloud_projects` (`owner`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_cloud_projects_share` ON `cloud_projects` (`share_hash`);--> statement-breakpoint
CREATE TABLE `cloud_versions` (
	`project` text NOT NULL,
	`revision` integer NOT NULL,
	`blob` text NOT NULL,
	`bytes` integer NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`project`, `revision`)
);
