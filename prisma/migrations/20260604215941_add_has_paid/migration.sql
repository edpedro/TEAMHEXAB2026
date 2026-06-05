-- AlterTable
ALTER TABLE "users" ADD COLUMN     "has_paid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paid_at" TIMESTAMP(3);
