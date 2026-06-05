import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ScoringService } from './scoring.service';
import { GamificationModule } from '../gamification/gamification.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RankingModule } from '../ranking/ranking.module';

@Module({
  imports: [GamificationModule, NotificationsModule, RankingModule],
  controllers: [AdminController],
  providers: [AdminService, ScoringService],
  exports: [AdminService, ScoringService],
})
export class AdminModule {}
