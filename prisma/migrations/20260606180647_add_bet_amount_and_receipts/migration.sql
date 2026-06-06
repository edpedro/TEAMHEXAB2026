-- AlterTable
ALTER TABLE "system_config" ADD COLUMN     "bet_amount" DECIMAL(10,2) NOT NULL DEFAULT 20.0,
ADD COLUMN     "pix_key" VARCHAR(100) NOT NULL DEFAULT '81986964573';

-- CreateTable
CREATE TABLE "payment_receipts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "file_path" VARCHAR(500) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(50) NOT NULL,
    "notes" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "admin_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_receipts_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
