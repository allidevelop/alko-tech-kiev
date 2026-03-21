import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260320230343 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "import_log" ("id" text not null, "profile_id" text not null, "started_at" timestamptz not null, "finished_at" timestamptz null, "status" text not null, "stats" jsonb not null default '{}', "errors" jsonb null, "triggered_by" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "import_log_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_import_log_deleted_at" ON "import_log" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "import_profile" ("id" text not null, "name" text not null, "slug" text not null, "format" text not null, "source_type" text not null, "source_url" text null, "field_mapping" jsonb not null default '{}', "category_mapping" jsonb not null default '{}', "settings" jsonb not null default '{}', "is_active" boolean not null default true, "last_sync_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "import_profile_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_import_profile_deleted_at" ON "import_profile" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "import_log" cascade;`);

    this.addSql(`drop table if exists "import_profile" cascade;`);
  }

}
