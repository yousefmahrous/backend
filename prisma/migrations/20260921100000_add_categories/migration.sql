-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "parent_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data: the four categories that used to be hardcoded in the code.
INSERT INTO "categories" ("slug", "name") VALUES
    ('novels',  '{"ar": "روايات", "en": "Novels"}'),
    ('science', '{"ar": "علمي", "en": "Science"}'),
    ('history', '{"ar": "تاريخي", "en": "History"}'),
    ('kids',    '{"ar": "أطفال", "en": "Kids"}');

-- AlterTable: nullable for now, the old "category" text column stays untouched.
ALTER TABLE "books" ADD COLUMN "category_id" INTEGER;

-- Backfill: match each book's old text to a category (also understands the old Arabic names).
UPDATE "books" SET "category_id" = "categories"."id"
FROM "categories"
WHERE "categories"."slug" = CASE "books"."category"
    WHEN 'روايات' THEN 'novels'
    WHEN 'علمي'   THEN 'science'
    WHEN 'تاريخي' THEN 'history'
    WHEN 'أطفال'  THEN 'kids'
    ELSE "books"."category"
END;

-- CreateIndex
CREATE INDEX "books_category_id_idx" ON "books"("category_id");

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;