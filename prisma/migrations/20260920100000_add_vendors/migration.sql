-- CreateTable
CREATE TABLE "vendors" (
    "id" SERIAL NOT NULL,
    "owner_id" INTEGER,
    "store_name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "is_platform" BOOLEAN NOT NULL DEFAULT false,
    "commission_bps" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendors_owner_id_key" ON "vendors"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_slug_key" ON "vendors"("slug");

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data: the store itself is vendor #1. It has no owner user (admins run it)
-- and a 0% commission because the store doesn't charge itself a fee.
INSERT INTO "vendors" ("store_name", "slug", "status", "is_platform", "commission_bps", "updated_at")
VALUES ('المتجر', 'platform', 'active', true, 0, CURRENT_TIMESTAMP);

-- Data: platform-wide default commission, in basis points (1000 = 10%).
-- Applies to any vendor whose own commission_bps is NULL. Admin edits it later.
INSERT INTO "platform_settings" ("key", "value", "updated_at")
VALUES ('default_commission_bps', '1000'::jsonb, CURRENT_TIMESTAMP);

-- AlterTable: add nullable first so existing rows are valid...
ALTER TABLE "books" ADD COLUMN "vendor_id" INTEGER;

-- ...backfill every existing book to the store's own vendor...
UPDATE "books" SET "vendor_id" = (SELECT "id" FROM "vendors" WHERE "is_platform" = true);

-- ...then lock it down.
ALTER TABLE "books" ALTER COLUMN "vendor_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "books_vendor_id_idx" ON "books"("vendor_id");

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;