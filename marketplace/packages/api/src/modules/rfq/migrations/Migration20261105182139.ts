import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261105182139 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "rfq" ("id" text not null, "status" text check ("status" in ('draft', 'negotiating', 'ready', 'accepted', 'cancelled')) not null default 'draft', "need_text" text not null, "items" jsonb null, "max_rounds" integer not null default 3, "accept_token" text not null, "order_group_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "rfq_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_rfq_deleted_at" ON "rfq" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "rfq_negotiation" ("id" text not null, "seller_id" text not null, "status" text check ("status" in ('awaiting_seller', 'awaiting_buyer', 'final', 'declined', 'accepted', 'rejected')) not null default 'awaiting_seller', "round" integer not null default 0, "rfq_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "rfq_negotiation_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_rfq_negotiation_rfq_id" ON "rfq_negotiation" ("rfq_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_rfq_negotiation_deleted_at" ON "rfq_negotiation" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "rfq_message" ("id" text not null, "author" text check ("author" in ('buyer_agent', 'seller_agent', 'system')) not null, "kind" text check ("kind" in ('offer', 'counter', 'final', 'decline', 'stop', 'note')) not null, "lines" jsonb null, "text" text null, "negotiation_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "rfq_message_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_rfq_message_negotiation_id" ON "rfq_message" ("negotiation_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_rfq_message_deleted_at" ON "rfq_message" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "rfq_negotiation" add constraint "rfq_negotiation_rfq_id_foreign" foreign key ("rfq_id") references "rfq" ("id") on update cascade;`);

    this.addSql(`alter table if exists "rfq_message" add constraint "rfq_message_negotiation_id_foreign" foreign key ("negotiation_id") references "rfq_negotiation" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "rfq_negotiation" drop constraint if exists "rfq_negotiation_rfq_id_foreign";`);

    this.addSql(`alter table if exists "rfq_message" drop constraint if exists "rfq_message_negotiation_id_foreign";`);

    this.addSql(`drop table if exists "rfq" cascade;`);

    this.addSql(`drop table if exists "rfq_negotiation" cascade;`);

    this.addSql(`drop table if exists "rfq_message" cascade;`);
  }

}
