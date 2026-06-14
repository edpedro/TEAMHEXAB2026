import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { GamificationService } from '../gamification/gamification.service';
import { RankingGateway } from '../ranking/ranking.gateway';
import { RankingService } from '../ranking/ranking.service';

@Injectable()
export class ScoringService {
  constructor(
    private prisma: PrismaService,
    private gamificationService: GamificationService,
    private rankingGateway: RankingGateway,
    private rankingService: RankingService,
  ) {}

  async calculateAndDistributePoints(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    });

    if (!match || match.homeScore === null || match.awayScore === null) {
      return;
    }

    const predictions = await this.prisma.prediction.findMany({
      where: { matchId },
    });

    for (const prediction of predictions) {
      const points = this.calculatePoints(
        match.homeScore,
        match.awayScore,
        prediction.predictedHome,
        prediction.predictedAway,
      );

      await this.prisma.prediction.update({
        where: { id: prediction.id },
        data: { pointsEarned: points },
      });

      await this.gamificationService.checkAndAwardAchievements(prediction.userId);
    }

    const ranking = await this.rankingService.getRanking();
    this.rankingGateway.emitRankingUpdate(ranking);
  }

  private calculatePoints(
    actualHome: number,
    actualAway: number,
    predictedHome: number,
    predictedAway: number,
  ): number {
    if (actualHome === predictedHome && actualAway === predictedAway) {
      return 5;
    }

    const actualIsDraw = actualHome === actualAway;
    const predictedIsDraw = predictedHome === predictedAway;

    if (!actualIsDraw && !predictedIsDraw) {
      const actualWinner = actualHome > actualAway ? 'home' : 'away';
      const predictedWinner = predictedHome > predictedAway ? 'home' : 'away';
      if (actualWinner === predictedWinner) {
        return 3;
      }
    }

    if (actualIsDraw && predictedIsDraw) {
      return 3;
    }

    return 0;
  }

  async recalculateAll() {
    const finishedMatches = await this.prisma.match.findMany({
      where: {
        status: 'FINISHED',
        homeScore: { not: null },
        awayScore: { not: null },
      },
    });

    for (const match of finishedMatches) {
      await this.calculateAndDistributePoints(match.id);
    }
  }

}
