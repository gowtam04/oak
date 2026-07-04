CREATE TABLE "wiki_chunk" (
	"id" text PRIMARY KEY NOT NULL,
	"page_id" text NOT NULL,
	"section" text NOT NULL,
	"content" text NOT NULL,
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', coalesce(section, '') || ' ' || coalesce(content, ''))) STORED
);
--> statement-breakpoint
CREATE TABLE "wiki_page" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"revised_at" bigint,
	"license" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "wiki_chunk_page_id_idx" ON "wiki_chunk" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "wiki_chunk_tsv_idx" ON "wiki_chunk" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "wiki_page_title_idx" ON "wiki_page" USING btree ("title");