-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "city" VARCHAR(100),
ADD COLUMN     "country" VARCHAR(100),
ADD COLUMN     "flag_away" VARCHAR(500),
ADD COLUMN     "flag_home" VARCHAR(500),
ADD COLUMN     "group_label" VARCHAR(5),
ADD COLUMN     "stadium" VARCHAR(150),
ADD COLUMN     "team_away_iso" VARCHAR(10),
ADD COLUMN     "team_home_iso" VARCHAR(10);
