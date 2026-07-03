CREATE TABLE "classic_encounters" (
	"id" integer PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"location" text NOT NULL,
	"area" text,
	"method" text NOT NULL,
	"species" text NOT NULL,
	"rarity" integer,
	"min_level" integer,
	"max_level" integer
);
--> statement-breakpoint
CREATE TABLE "natdex_machines" (
	"version_group" text NOT NULL,
	"machine" text NOT NULL,
	"move_slug" text NOT NULL,
	"item_slug" text NOT NULL,
	CONSTRAINT "natdex_machines_version_group_machine_pk" PRIMARY KEY("version_group","machine")
);
--> statement-breakpoint
CREATE TABLE "natdex_moves" (
	"move_slug" text PRIMARY KEY NOT NULL,
	"generation" integer NOT NULL,
	"type" text,
	"damage_class" text
);
--> statement-breakpoint
CREATE TABLE "natdex_species" (
	"species" text PRIMARY KEY NOT NULL,
	"national_dex_number" integer NOT NULL,
	"generation" integer NOT NULL,
	"color" text,
	"shape" text,
	"capture_rate" integer,
	"base_stat_total" integer NOT NULL,
	"evolves_from" text,
	"type1" text NOT NULL,
	"type2" text
);
--> statement-breakpoint
CREATE TABLE "pmd_recruits" (
	"game" text NOT NULL,
	"species" text NOT NULL,
	"location" text NOT NULL,
	"recruit_rate" text,
	"friend_area" text,
	CONSTRAINT "pmd_recruits_game_species_pk" PRIMARY KEY("game","species")
);
--> statement-breakpoint
CREATE INDEX "classic_encounters_species_idx" ON "classic_encounters" USING btree ("species");--> statement-breakpoint
CREATE INDEX "classic_encounters_version_idx" ON "classic_encounters" USING btree ("version");--> statement-breakpoint
CREATE INDEX "classic_encounters_location_idx" ON "classic_encounters" USING btree ("location");--> statement-breakpoint
CREATE INDEX "natdex_machines_move_slug_idx" ON "natdex_machines" USING btree ("move_slug");--> statement-breakpoint
CREATE INDEX "natdex_moves_generation_idx" ON "natdex_moves" USING btree ("generation");--> statement-breakpoint
CREATE INDEX "natdex_moves_type_idx" ON "natdex_moves" USING btree ("type");--> statement-breakpoint
CREATE INDEX "natdex_species_national_dex_number_idx" ON "natdex_species" USING btree ("national_dex_number");--> statement-breakpoint
CREATE INDEX "natdex_species_generation_idx" ON "natdex_species" USING btree ("generation");--> statement-breakpoint
CREATE INDEX "natdex_species_color_idx" ON "natdex_species" USING btree ("color");--> statement-breakpoint
CREATE INDEX "natdex_species_shape_idx" ON "natdex_species" USING btree ("shape");--> statement-breakpoint
CREATE INDEX "natdex_species_type1_idx" ON "natdex_species" USING btree ("type1");--> statement-breakpoint
CREATE INDEX "natdex_species_type2_idx" ON "natdex_species" USING btree ("type2");--> statement-breakpoint
CREATE INDEX "natdex_species_evolves_from_idx" ON "natdex_species" USING btree ("evolves_from");--> statement-breakpoint
CREATE INDEX "pmd_recruits_species_idx" ON "pmd_recruits" USING btree ("species");