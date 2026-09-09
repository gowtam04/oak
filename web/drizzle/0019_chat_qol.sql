ALTER TABLE "conversation" ADD COLUMN "folder_id" text NULL;
--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "archived" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "conversation_message" ADD COLUMN "pinned" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE "conversation_folder" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_folder_account_name_unique" ON "conversation_folder" ("account_id", lower("name"));
--> statement-breakpoint
CREATE INDEX "conversation_folder_account_name_idx" ON "conversation_folder" USING btree ("account_id", "name");
--> statement-breakpoint
CREATE TABLE "account_scope_mru" (
	"account_id" text NOT NULL,
	"format" text NOT NULL,
	"last_used_at" bigint NOT NULL,
	CONSTRAINT "account_scope_mru_pkey" PRIMARY KEY ("account_id", "format")
);
--> statement-breakpoint
CREATE TABLE "shared_answer" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"conversation_id" text,
	"conversation_title" text NOT NULL,
	"question_text" text NOT NULL,
	"answer_json" text NOT NULL,
	"created_at" bigint NOT NULL,
	"revoked_at" bigint
);
--> statement-breakpoint
CREATE INDEX "conversation_account_folder_idx" ON "conversation" USING btree ("account_id", "folder_id");
--> statement-breakpoint
CREATE INDEX "conversation_account_archived_idx" ON "conversation" USING btree ("account_id", "archived");
--> statement-breakpoint
CREATE INDEX "shared_answer_account_created_idx" ON "shared_answer" USING btree ("account_id", "created_at");
