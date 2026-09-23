-- AlterTable: nullable for now, book_id stays as-is and keeps working.
ALTER TABLE "cart_items" ADD COLUMN "variant_id" INTEGER;

-- Backfill: each book currently has exactly one variant (from the
-- add_product_variants migration), so match every cart item to it.
UPDATE "cart_items" ci
SET "variant_id" = pv."id"
FROM "product_variants" pv
WHERE pv."product_id" = ci."book_id";

-- CreateIndex: lets the application look up/update a cart line by its variant.
CREATE UNIQUE INDEX "cart_items_cart_id_variant_id_key" ON "cart_items"("cart_id", "variant_id");
CREATE INDEX "cart_items_variant_id_idx" ON "cart_items"("variant_id");

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;