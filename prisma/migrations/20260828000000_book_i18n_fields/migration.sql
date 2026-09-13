-- Convert "title" and "description" from plain text to bilingual JSON.
-- Existing values (which were Arabic-only) are preserved under "ar",
-- and "en" starts empty so an admin can fill it in from the dashboard.
ALTER TABLE "books"
  ALTER COLUMN "title" TYPE JSONB USING jsonb_build_object('ar', "title", 'en', ''),
  ALTER COLUMN "description" TYPE JSONB USING jsonb_build_object('ar', "description", 'en', '');

-- Convert "category" from Arabic labels to stable keys so it can be
-- translated on the frontend/backend instead of being hardcoded Arabic text.
UPDATE "books" SET "category" = CASE "category"
  WHEN 'روايات' THEN 'novels'
  WHEN 'علمي' THEN 'science'
  WHEN 'تاريخي' THEN 'history'
  WHEN 'أطفال' THEN 'kids'
  ELSE "category"
END;