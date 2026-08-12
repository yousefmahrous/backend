-- Rename "bookings" table to "books" (Booking model -> Book model)
ALTER TABLE "bookings" RENAME TO "books";
ALTER TABLE "books" RENAME CONSTRAINT "bookings_pkey" TO "books_pkey";

-- Change default role for new users from 'student' to 'customer'
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'customer';
