import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { GamificationService } from '../gamification/gamification.service';
import { RankingGateway } from '../ranking/ranking.gateway';
import { RankingService } from '../ranking/ranking.service';
import { MatchesGateway } from '../matches/matches.gateway';
import { WhatsappService } from '../whatsapp/whatsapp.service';

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(
    private prisma: PrismaService,
    private gamificationService: GamificationService,
    private rankingGateway: RankingGateway,
    private rankingService: RankingService,
    private matchesGateway: MatchesGateway,
    private whatsappService: WhatsappService,
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
      include: {
        user: { select: { fullName: true } },
      },
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
      prediction.pointsEarned = points;

      await this.gamificationService.checkAndAwardAchievements(prediction.userId);
    }

    const ranking = await this.rankingService.getRanking();
    this.rankingGateway.emitRankingUpdate(ranking);

    const updatedMatch = await this.prisma.match.findUnique({
      where: { id: matchId },
    });
    if (updatedMatch) {
      this.matchesGateway.emitMatchUpdate(updatedMatch);
    }

    await this.sendWhatsAppNotifications(match, predictions, ranking);
  }

  private async sendWhatsAppNotifications(
    match: { id: string; teamHome: string; teamAway: string; flagHome: string | null; flagAway: string | null; homeScore: number | null; awayScore: number | null; status: string },
    predictions: { id: string; predictedHome: number; predictedAway: number; pointsEarned: number | null; createdAt: Date; user: { fullName: string } }[],
    ranking: { fullName: string; position: number; score: number }[],
  ): Promise<void> {
    if (match.status !== 'FINISHED' || match.homeScore === null || match.awayScore === null) return;

    const alreadySent = await this.whatsappService.hasNotificationBeenSent('match_finished', match.id);
    if (alreadySent) return;

    const predData = predictions.map((p) => ({
      userName: p.user.fullName,
      predictedHome: p.predictedHome,
      predictedAway: p.predictedAway,
      pointsEarned: p.pointsEarned ?? 0,
      createdAt: p.createdAt,
    }));

    const matchOk = await this.whatsappService.sendMatchFinishedNotification(
      match.teamHome,
      match.teamAway,
      match.homeScore ?? 0,
      match.awayScore ?? 0,
      predData,
    );

    if (matchOk) {
      await this.whatsappService.recordNotification('match_finished', match.id, true);
    }

    const rankOk = await this.whatsappService.sendRankingNotification(
      ranking.map((r) => ({ position: r.position, userName: r.fullName, score: r.score })),
    );

    if (matchOk || rankOk) {
      this.logger.log(`Notificações WhatsApp enviadas para partida ${match.id}`);
    }
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
