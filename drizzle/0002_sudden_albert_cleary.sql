CREATE TABLE `app_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'editor' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`auth_subject` text,
	`last_seen_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_users_email_unique` ON `app_users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_users_auth_subject_unique` ON `app_users` (`auth_subject`);--> statement-breakpoint
ALTER TABLE `posts` ADD `approved_by_user_id` text;