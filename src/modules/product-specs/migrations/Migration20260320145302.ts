import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260320145302 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "spec_attribute" drop constraint if exists "spec_attribute_slug_unique";`);
    this.addSql(`create table if not exists "spec_attribute" ("id" text not null, "slug" text not null, "label" text not null, "type" text not null default 'text', "unit" text null, "is_filterable" boolean not null default true, "sort_order" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "spec_attribute_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_spec_attribute_slug_unique" ON "spec_attribute" ("slug") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_spec_attribute_deleted_at" ON "spec_attribute" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "product_spec_value" ("id" text not null, "product_id" text not null, "text_value" text null, "numeric_value" real null, "attribute_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "product_spec_value_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_spec_value_attribute_id" ON "product_spec_value" ("attribute_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_spec_value_deleted_at" ON "product_spec_value" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "category_spec_attribute" ("id" text not null, "category_id" text not null, "sort_order" integer not null default 0, "attribute_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "category_spec_attribute_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_category_spec_attribute_attribute_id" ON "category_spec_attribute" ("attribute_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_category_spec_attribute_deleted_at" ON "category_spec_attribute" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "product_spec_value" add constraint "product_spec_value_attribute_id_foreign" foreign key ("attribute_id") references "spec_attribute" ("id") on update cascade;`);

    this.addSql(`alter table if exists "category_spec_attribute" add constraint "category_spec_attribute_attribute_id_foreign" foreign key ("attribute_id") references "spec_attribute" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "product_spec_value" drop constraint if exists "product_spec_value_attribute_id_foreign";`);

    this.addSql(`alter table if exists "category_spec_attribute" drop constraint if exists "category_spec_attribute_attribute_id_foreign";`);

    this.addSql(`drop table if exists "spec_attribute" cascade;`);

    this.addSql(`drop table if exists "product_spec_value" cascade;`);

    this.addSql(`drop table if exists "category_spec_attribute" cascade;`);
  }

}
