import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261105183403 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "rfq_message" drop constraint if exists "rfq_message_author_check";`);

    this.addSql(`alter table if exists "rfq" add column if not exists "cart_id" text null;`);

    this.addSql(`alter table if exists "rfq_message" add constraint "rfq_message_author_check" check("author" in ('buyer', 'buyer_agent', 'seller_agent', 'system'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "rfq_message" drop constraint if exists "rfq_message_author_check";`);

    this.addSql(`alter table if exists "rfq" drop column if exists "cart_id";`);

    this.addSql(`alter table if exists "rfq_message" add constraint "rfq_message_author_check" check("author" in ('buyer_agent', 'seller_agent', 'system'));`);
  }

}
