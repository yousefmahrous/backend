-- cart_items: a cart may now hold several variants of the same product
-- (cart_items_cart_id_variant_id_key still prevents duplicate variants).
DROP INDEX "cart_items_cart_id_product_id_key";

-- order_items: remember which variant was bought, so refunds/failed orders restock the right one.
ALTER TABLE "order_items" ADD COLUMN "variant_id" INTEGER;

-- Backfill: every existing product has exactly one variant.
UPDATE "order_items"
SET "variant_id" = (
    SELECT pv."id" FROM "product_variants" pv
    WHERE pv."product_id" = "order_items"."product_id"
    ORDER BY pv."id" LIMIT 1
);

-- CreateIndex
CREATE INDEX "order_items_variant_id_idx" ON "order_items"("variant_id");

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;