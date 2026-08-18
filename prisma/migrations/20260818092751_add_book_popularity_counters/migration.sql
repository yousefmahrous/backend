/*
  Warnings:

  - You are about to drop the `contact_messages` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "books" ADD COLUMN     "cart_adds_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "favorites_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "popularity_score" INTEGER NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE "contact_messages";
