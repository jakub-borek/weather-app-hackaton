import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261105191453 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "seller_price_rule" drop constraint if exists "seller_price_rule_offer_id_unique";`);
    this.addSql(`create table if not exists "seller_price_rule" ("id" text not null, "offer_id" text not null, "seller_id" text not null, "variant_id" text not null, "min_unit_price" integer not null, "volume_discounts" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "seller_price_rule_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_price_rule_deleted_at" ON "seller_price_rule" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_seller_price_rule_offer_id_unique" ON "seller_price_rule" ("offer_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_price_rule_seller_id_variant_id" ON "seller_price_rule" ("seller_id", "variant_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "seller_price_rule" cascade;`);
  }

}
