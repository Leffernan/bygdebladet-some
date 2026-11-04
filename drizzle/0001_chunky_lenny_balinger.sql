CREATE TABLE `meta_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`token_ciphertext` text NOT NULL,
	`page_id` text NOT NULL,
	`instagram_id` text NOT NULL,
	`api_version` text NOT NULL,
	`page_name` text NOT NULL,
	`instagram_username` text NOT NULL,
	`token_expires_at` text NOT NULL,
	`publishing_enabled` integer DEFAULT 0 NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL
);
