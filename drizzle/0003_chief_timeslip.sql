ALTER TABLE `cloud_deletions` ADD `ready` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_cloud_versions_blob` ON `cloud_versions` (`blob`);