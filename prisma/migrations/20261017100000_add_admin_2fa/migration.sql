-- AlterTable
ALTER TABLE "users" ADD COLUMN     "twofa_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "twofa_secret" TEXT;