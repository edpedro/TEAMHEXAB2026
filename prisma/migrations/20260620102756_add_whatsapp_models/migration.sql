-- CreateTable
CREATE TABLE "whatsapp_sessions" (
    "id" UUID NOT NULL,
    "session_name" VARCHAR(50) NOT NULL DEFAULT 'default',
    "status" VARCHAR(20) NOT NULL DEFAULT 'DISCONNECTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "whatsapp_sessions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "whatsapp_groups" (
    "id" UUID NOT NULL,
    "group_id" VARCHAR(100) NOT NULL,
    "group_name" VARCHAR(200) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "whatsapp_groups_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "whatsapp_notifications" (
    "id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "match_id" UUID,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    CONSTRAINT "whatsapp_notifications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "whatsapp_groups_group_id_key" ON "whatsapp_groups"("group_id");