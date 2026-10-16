-- Group the four original book categories under a new top-level "Books" category.
INSERT INTO "categories" ("slug", "name")
VALUES ('books', '{"ar": "كتب", "en": "Books"}')
ON CONFLICT ("slug") DO NOTHING;

UPDATE "categories"
SET "parent_id" = (SELECT "id" FROM "categories" WHERE "slug" = 'books')
WHERE "slug" IN ('novels', 'science', 'history', 'kids')
  AND "parent_id" IS NULL;