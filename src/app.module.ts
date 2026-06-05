import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './common/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MatchesModule } from './matches/matches.module';
import { PredictionsModule } from './predictions/predictions.module';
import { RankingModule } from './ranking/ranking.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AdminModule } from './admin/admin.module';
import { GamificationModule } from './gamification/gamification.module';
import { FootballApiModule } from './football-api/football-api.module';
import { TopScorersModule } from './top-scorers/top-scorers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    MatchesModule,
    PredictionsModule,
    RankingModule,
    NotificationsModule,
    AdminModule,
    GamificationModule,
    FootballApiModule,
    TopScorersModule,
  ],
})
export class AppModule {}
