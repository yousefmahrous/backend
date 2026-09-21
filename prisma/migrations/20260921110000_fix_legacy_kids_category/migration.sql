-- Some old books have the kids category spelled without the hamza ("اطفال").
-- Point them at the real "kids" category and fix the old text value too.
UPDATE "books"
SET "category_id" = (SELECT "id" FROM "categories" WHERE "slug" = 'kids'),
    "category" = 'kids'
WHERE "category" = 'اطفال';