import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { ConfigController } from './config.controller';
import { AdminService } from './admin.service';
import { ScoringService } from './scoring.service';
import { GamificationModule } from '../gamification/gamification.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RankingModule } from '../ranking/ranking.module';
import { ReceiptsModule } from '../receipts/receipts.module';
import { MatchesModule } from '../matches/matches.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [GamificationModule, NotificationsModule, RankingModule, ReceiptsModule, MatchesModule, WhatsappModule],
  controllers: [AdminController, ConfigController],
  providers: [AdminService, ScoringService],
  exports: [AdminService, ScoringService],
})
export class AdminModule {}
