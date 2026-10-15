-- Rename the "books" table to "products" and every book_id column to product_id.
-- Pure renames: no data is touched or copied.

-- Table + its own constraints/indexes
ALTER TABLE "books" RENAME TO "products";
ALTER TABLE "products" RENAME CONSTRAINT "books_pkey" TO "products_pkey";
ALTER TABLE "products" RENAME CONSTRAINT "books_category_id_fkey" TO "products_category_id_fkey";
ALTER TABLE "products" RENAME CONSTRAINT "books_vendor_id_fkey" TO "products_vendor_id_fkey";
ALTER INDEX "books_category_id_idx" RENAME TO "products_category_id_idx";
ALTER INDEX "books_status_idx" RENAME TO "products_status_idx";
ALTER INDEX "books_vendor_id_idx" RENAME TO "products_vendor_id_idx";

-- cart_items
ALTER TABLE "cart_items" RENAME COLUMN "book_id" TO "product_id";
ALTER TABLE "cart_items" RENAME CONSTRAINT "cart_items_book_id_fkey" TO "cart_items_product_id_fkey";
ALTER INDEX "cart_items_cart_id_book_id_key" RENAME TO "cart_items_cart_id_product_id_key";

-- favorites
ALTER TABLE "favorites" RENAME COLUMN "book_id" TO "product_id";
ALTER TABLE "favorites" RENAME CONSTRAINT "favorites_book_id_fkey" TO "favorites_product_id_fkey";
ALTER INDEX "favorites_user_id_book_id_key" RENAME TO "favorites_user_id_product_id_key";

-- reviews
ALTER TABLE "reviews" RENAME COLUMN "book_id" TO "product_id";
ALTER TABLE "reviews" RENAME CONSTRAINT "reviews_book_id_fkey" TO "reviews_product_id_fkey";
ALTER INDEX "reviews_user_id_book_id_key" RENAME TO "reviews_user_id_product_id_key";

-- order_items
ALTER TABLE "order_items" RENAME COLUMN "book_id" TO "product_id";
ALTER TABLE "order_items" RENAME CONSTRAINT "order_items_book_id_fkey" TO "order_items_product_id_fkey";
