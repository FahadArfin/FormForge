CREATE TABLE `cloud_deletions` (
	`project` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`blobs` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_cloud_deletions_owner` ON `cloud_deletions` (`owner`);--> statement-breakpoint
CREATE INDEX `idx_cloud_comments_author_created` ON `cloud_comments` (`author`,`created`);