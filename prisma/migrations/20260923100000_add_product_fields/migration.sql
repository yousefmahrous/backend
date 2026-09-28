ALTER TABLE "books" ADD COLUMN "brand" TEXT;
ALTER TABLE "books" ADD COLUMN "attributes" JSONB;
ALTER TABLE "books" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'published';

CREATE INDEX "books_status_idx" ON "books"("status");