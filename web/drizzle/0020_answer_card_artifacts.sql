ALTER TABLE "account" ADD COLUMN "answer_density" text;
--> statement-breakpoint
CREATE TABLE "conversation_artifact_pin" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"snapshot_json" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "conversation_artifact_pin_account_conv_created_idx" ON "conversation_artifact_pin" USING btree ("account_id", "conversation_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_artifact_pin_account_conv_id_unique" ON "conversation_artifact_pin" ("account_id", "conversation_id", "id");
