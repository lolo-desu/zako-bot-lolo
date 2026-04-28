CREATE TABLE `llm_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`format` text NOT NULL,
	`base_url` text DEFAULT '' NOT NULL,
	`api_key` text DEFAULT '' NOT NULL,
	`enabled_models` text DEFAULT '[]' NOT NULL,
	`disabled_models` text DEFAULT '[]' NOT NULL,
	`region` text DEFAULT '' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`builtin` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `bot_instances` ADD `llm_provider_id` text REFERENCES llm_providers(id) ON DELETE SET NULL;
