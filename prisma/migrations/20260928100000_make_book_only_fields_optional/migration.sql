-- Book-only fields become optional so non-book products can be created.
-- Purely additive: dropping NOT NULL never touches existing rows.
ALTER TABLE "books" ALTER COLUMN "isbn" DROP NOT NULL;
ALTER TABLE "books" ALTER COLUMN "publisher_email" DROP NOT NULL;
ALTER TABLE "books" ALTER COLUMN "publisher" DROP NOT NULL;
