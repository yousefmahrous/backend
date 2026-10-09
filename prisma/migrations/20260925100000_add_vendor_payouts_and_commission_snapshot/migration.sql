-- AlterTable: money snapshot + payout link on each vendor shipment
ALTER TABLE "vendor_orders" ADD COLUMN "commission_bps" INTEGER,
ADD COLUMN "gross_amount" INTEGER,
ADD COLUMN "commission_amount" INTEGER,
ADD COLUMN "net_amount" INTEGER,
ADD COLUMN "payout_id" INTEGER;

-- CreateTable
CREATE TABLE "payouts" (
    "id"            SERIAL NOT NULL,
    "vendor_id"     INTEGER NOT NULL,
    "amount"        INTEGER NOT NULL,
    "currency"      TEXT NOT NULL DEFAULT 'egp',
    "reference"     TEXT,
    "note"          TEXT,
    "created_by_id" INTEGER,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payouts_vendor_id_idx" ON "payouts"("vendor_id");
CREATE INDEX "vendor_orders_payout_id_idx" ON "vendor_orders"("payout_id");

-- AddForeignKey
ALTER TABLE "vendor_orders" ADD CONSTRAINT "vendor_orders_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: freeze the money snapshot for orders that were already paid.
-- Rate = the vendor's own commission_bps, else the platform default (1000 = 10%);
-- the store's own vendor (is_platform) pays no commission.
UPDATE "vendor_orders" vo
SET "gross_amount"      = t."gross",
    "commission_bps"    = t."bps",
    "commission_amount" = ROUND(t."gross" * t."bps" / 10000.0),
    "net_amount"        = t."gross" - ROUND(t."gross" * t."bps" / 10000.0)
FROM (
  SELECT vo2."id" AS "id",
         COALESCE(SUM(oi."unit_price" * oi."quantity"), 0) AS "gross",
         CASE
           WHEN v."is_platform" THEN 0
           ELSE COALESCE(
             v."commission_bps",
             (SELECT ("value" #>> '{}')::INTEGER FROM "platform_settings" WHERE "key" = 'default_commission_bps'),
             1000
           )
         END AS "bps"
  FROM "vendor_orders" vo2
  JOIN "vendors" v ON v."id" = vo2."vendor_id"
  JOIN "orders" o ON o."id" = vo2."order_id"
  LEFT JOIN "order_items" oi ON oi."vendor_order_id" = vo2."id"
  WHERE o."paid_at" IS NOT NULL
  GROUP BY vo2."id", v."is_platform", v."commission_bps"
) t
WHERE vo."id" = t."id";