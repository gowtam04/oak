CREATE TABLE "app_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_by" text,
	"updated_at" bigint NOT NULL
);
