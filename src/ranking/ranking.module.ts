import { Module } from '@nestjs/common';
import { RankingController } from './ranking.controller';
import { RankingService } from './ranking.service';
import { RankingGateway } from './ranking.gateway';

@Module({
  controllers: [RankingController],
  providers: [RankingService, RankingGateway],
  exports: [RankingService, RankingGateway],
})
export class RankingModule {}
