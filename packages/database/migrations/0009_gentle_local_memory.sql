CREATE TABLE `local_memories` (
	`id` text PRIMARY KEY NOT NULL,
	`bot_instance_id` text NOT NULL,
	`platform` text NOT NULL,
	`user_id` text NOT NULL,
	`memory` text NOT NULL,
	`kind` text DEFAULT 'fact' NOT NULL,
	`source_topic_id` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_used_at` integer NOT NULL,
	FOREIGN KEY (`bot_instance_id`) REFERENCES `bot_instances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `local_memories_scope_updated_idx` ON `local_memories` (`bot_instance_id`,`platform`,`user_id`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `local_memories_scope_last_used_idx` ON `local_memories` (`bot_instance_id`,`platform`,`user_id`,`last_used_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_memories_scope_memory_unique` ON `local_memories` (`bot_instance_id`,`platform`,`user_id`,`memory`);
