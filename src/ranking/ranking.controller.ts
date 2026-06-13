import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { RankingService } from './ranking.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('ranking')
@UseGuards(JwtAuthGuard)
export class RankingController {
  constructor(private rankingService: RankingService) {}

  @Get()
  getRanking(@Query('limit') limit?: string) {
    return this.rankingService.getRanking(limit ? +limit : 50);
  }

  @Get('me')
  getMyPosition(@CurrentUser('id') userId: string) {
    return this.rankingService.getUserPosition(userId);
  }

  @Get('history')
  getMyHistory(@CurrentUser('id') userId: string) {
    return this.rankingService.getHistory(userId);
  }

  @Get('history/:userId')
  getUserHistory(@Param('userId') userId: string) {
    return this.rankingService.getHistory(userId);
  }

  @Get('prize-rules')
  getPrizeRules() {
    return this.rankingService.getPrizeRules();
  }

  @Get(':userId/predictions')
  getUserPredictions(
    @Param('userId') userId: string,
    @Query('phase') phase?: string,
    @Query('groupLabel') groupLabel?: string,
    @Query('team') team?: string,
    @Query('points') points?: string,
  ) {
    return this.rankingService.getUserPredictions(userId, {
      phase,
      groupLabel,
      team,
      points: points ? +points : undefined,
    });
  }
}
