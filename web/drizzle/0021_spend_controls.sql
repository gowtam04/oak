CREATE TABLE "account_denylist" (
	"email" text PRIMARY KEY NOT NULL,
	"added_at" bigint NOT NULL,
	"added_by" text
);
--> statement-breakpoint
CREATE TABLE "spend_daily_usage" (
	"subject_key" text NOT NULL,
	"day_utc" text NOT NULL,
	"admitted_count" integer NOT NULL,
	CONSTRAINT "spend_daily_usage_pkey" PRIMARY KEY ("subject_key", "day_utc")
);
