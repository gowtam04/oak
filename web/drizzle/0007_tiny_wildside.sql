CREATE TABLE "champions_item_exclusion" (
	"slug" text PRIMARY KEY NOT NULL,
	"excluded_at" bigint NOT NULL,
	"excluded_by" text
);
