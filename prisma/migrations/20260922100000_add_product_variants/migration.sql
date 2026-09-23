-- CreateTable
CREATE TABLE "product_variants" (
    "id"         SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "sku"        TEXT,
    "barcode"    TEXT,
    "options"    JSONB NOT NULL DEFAULT '{}',
    "price"      INTEGER NOT NULL,
    "stock"      INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_product_id_sku_key" ON "product_variants"("product_id", "sku");

-- CreateIndex
CREATE INDEX "product_variants_product_id_idx" ON "product_variants"("product_id");

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing book becomes a product with exactly one variant,
-- carrying over its current price, stock and ISBN. The old books.price /
-- books.stock columns are left untouched for now — later parts of this step
-- will move reads over to the variant before those columns are dropped.
INSERT INTO "product_variants" ("product_id", "barcode", "price", "stock", "updated_at")
SELECT "id", "isbn", "price", "stock", CURRENT_TIMESTAMP
FROM "books";