CREATE TABLE "auth_event" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"email" text,
	"account_id" text,
	"created_flag" integer,
	"detail" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turn_record" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"account_id" text,
	"model" text,
	"provider_model" text,
	"mode" text NOT NULL,
	"status" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"thinking_tokens" integer DEFAULT 0 NOT NULL,
	"tool_trace" text DEFAULT '[]' NOT NULL,
	"tool_error_count" integer DEFAULT 0 NOT NULL,
	"citation_count" integer DEFAULT 0 NOT NULL,
	"turn_latency_ms" integer DEFAULT 0 NOT NULL,
	"images_count" integer DEFAULT 0 NOT NULL,
	"prompt_text" text DEFAULT '' NOT NULL,
	"answer_text" text,
	"answer_json" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auth_event_created_idx" ON "auth_event" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "auth_event_type_created_idx" ON "auth_event" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "turn_record_created_idx" ON "turn_record" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "turn_record_account_created_idx" ON "turn_record" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "turn_record_session_idx" ON "turn_record" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "turn_record_status_created_idx" ON "turn_record" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "turn_record_model_created_idx" ON "turn_record" USING btree ("model","created_at");