-- AlterTable: per-shipment return state
ALTER TABLE "vendor_orders" ADD COLUMN "return_status" TEXT,
ADD COLUMN "refunded_at" TIMESTAMP(3);

-- AlterTable: a refund request can now target one vendor's shipment
ALTER TABLE "refund_requests" ADD COLUMN "vendor_order_id" INTEGER,
ADD COLUMN "refund_amount" INTEGER;

-- CreateIndex
CREATE INDEX "refund_requests_vendor_order_id_idx" ON "refund_requests"("vendor_order_id");

-- AddForeignKey
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_vendor_order_id_fkey" FOREIGN KEY ("vendor_order_id") REFERENCES "vendor_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: carry the existing whole-order return states down to every shipment of those orders.
UPDATE "vendor_orders" vo SET "return_status" = 'requested'
FROM "orders" o WHERE o."id" = vo."order_id" AND o."status" = 'return_requested';

UPDATE "vendor_orders" vo SET "return_status" = 'approved'
FROM "orders" o WHERE o."id" = vo."order_id" AND o."status" = 'return_approved';

UPDATE "vendor_orders" vo SET "return_status" = 'refunded'
FROM "orders" o WHERE o."id" = vo."order_id" AND o."status" = 'refunded';