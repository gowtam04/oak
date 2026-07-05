CREATE TABLE "meta_snapshot" (
	"meta_format" text NOT NULL,
	"month" text NOT NULL,
	"smogon_format_id" text NOT NULL,
	"cutoff" integer NOT NULL,
	"total_battles" integer,
	"species_count" integer NOT NULL,
	"fetched_at" bigint NOT NULL,
	"source_url" text NOT NULL,
	CONSTRAINT "meta_snapshot_meta_format_month_pk" PRIMARY KEY("meta_format","month")
);
--> statement-breakpoint
CREATE TABLE "meta_usage" (
	"meta_format" text NOT NULL,
	"month" text NOT NULL,
	"species" text NOT NULL,
	"display_name" text NOT NULL,
	"rank" integer NOT NULL,
	"usage_pct" double precision NOT NULL,
	"raw_count" integer,
	"moves" text NOT NULL,
	"items" text NOT NULL,
	"abilities" text NOT NULL,
	"spreads" text NOT NULL,
	"teammates" text NOT NULL,
	"counters" text NOT NULL,
	CONSTRAINT "meta_usage_meta_format_month_species_pk" PRIMARY KEY("meta_format","month","species")
);
--> statement-breakpoint
CREATE INDEX "meta_snapshot_month_idx" ON "meta_snapshot" USING btree ("month");--> statement-breakpoint
CREATE INDEX "meta_usage_rank_idx" ON "meta_usage" USING btree ("meta_format","month","rank");--> statement-breakpoint
CREATE INDEX "meta_usage_species_idx" ON "meta_usage" USING btree ("species");