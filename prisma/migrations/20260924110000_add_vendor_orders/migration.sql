-- CreateTable
CREATE TABLE "vendor_orders" (
    "id"                 SERIAL NOT NULL,
    "order_id"           INTEGER NOT NULL,
    "vendor_id"          INTEGER NOT NULL,
    "fulfillment_status" TEXT NOT NULL DEFAULT 'pending',
    "carrier"            TEXT,
    "tracking_number"    TEXT,
    "shipped_at"         TIMESTAMP(3),
    "delivered_at"       TIMESTAMP(3),
    "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendor_orders_order_id_vendor_id_key" ON "vendor_orders"("order_id", "vendor_id");
CREATE INDEX "vendor_orders_vendor_id_idx" ON "vendor_orders"("vendor_id");

-- AddForeignKey
ALTER TABLE "vendor_orders" ADD CONSTRAINT "vendor_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendor_orders" ADD CONSTRAINT "vendor_orders_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN "vendor_order_id" INTEGER;

-- Backfill: one VendorOrder per (order, vendor) pair found in existing order items.
INSERT INTO "vendor_orders" ("order_id", "vendor_id", "updated_at")
SELECT DISTINCT oi."order_id", b."vendor_id", CURRENT_TIMESTAMP
FROM "order_items" oi
JOIN "books" b ON b."id" = oi."book_id";

UPDATE "order_items" oi
SET "vendor_order_id" = vo."id"
FROM "vendor_orders" vo, "books" b
WHERE b."id" = oi."book_id"
  AND vo."order_id" = oi."order_id"
  AND vo."vendor_id" = b."vendor_id";

-- CreateIndex
CREATE INDEX "order_items_vendor_order_id_idx" ON "order_items"("vendor_order_id");

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_vendor_order_id_fkey" FOREIGN KEY ("vendor_order_id") REFERENCES "vendor_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;