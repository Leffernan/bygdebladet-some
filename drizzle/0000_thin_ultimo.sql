CREATE TABLE `deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`channel` text NOT NULL,
	`revision` integer NOT NULL,
	`state` text DEFAULT 'ready' NOT NULL,
	`remote_id` text,
	`remote_url` text,
	`container_id` text,
	`stage_id` text,
	`error` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`result` text
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`intro` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'Nyheiter' NOT NULL,
	`image_url` text NOT NULL,
	`credit` text DEFAULT '' NOT NULL,
	`ai` integer DEFAULT 0 NOT NULL,
	`crop_x` real DEFAULT 0.5 NOT NULL,
	`crop_y` real DEFAULT 0.4 NOT NULL,
	`facebook_text` text NOT NULL,
	`instagram_text` text NOT NULL,
	`alt_text` text DEFAULT '' NOT NULL,
	`channels` text DEFAULT '["facebook","instagram"]' NOT NULL,
	`warnings` text DEFAULT '[]' NOT NULL,
	`rank` integer DEFAULT 0 NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`approved_revision` integer,
	`approved_by` text,
	`approved_at` text,
	`image_key` text,
	`image_hash` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `posts_url_unique` ON `posts` (`url`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
