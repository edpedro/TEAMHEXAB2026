-- CreateTable
CREATE TABLE "top_scorer_predictions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "player1" VARCHAR(150) NOT NULL,
    "player2" VARCHAR(150) NOT NULL,
    "player3" VARCHAR(150) NOT NULL,
    "player4" VARCHAR(150) NOT NULL,
    "player5" VARCHAR(150) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "top_scorer_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "top_scorer_predictions_user_id_key" ON "top_scorer_predictions"("user_id");

-- AddForeignKey
ALTER TABLE "top_scorer_predictions" ADD CONSTRAINT "top_scorer_predictions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
