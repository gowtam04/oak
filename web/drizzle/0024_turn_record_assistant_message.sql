ALTER TABLE "turn_record" ADD COLUMN "assistant_message_id" text;--> statement-breakpoint
CREATE INDEX "turn_record_assistant_message_idx" ON "turn_record" USING btree ("assistant_message_id");
