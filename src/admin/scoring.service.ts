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
    match: { id: string; teamHome: string; teamAway: string; teamHomeIso: string | null; teamAwayIso: string | null; flagHome: string | null; flagAway: string | null; homeScore: number | null; awayScore: number | null; status: string; matchDate: Date },
    predictions: { id: string; userId: string; predictedHome: number; predictedAway: number; pointsEarned: number | null; createdAt: Date; user: { fullName: string } }[],
    ranking: { id: string; fullName: string; position: number; score: number }[],
  ): Promise<void> {
    if (match.status !== 'FINISHED' || match.homeScore === null || match.awayScore === null) return;

    const alreadySent = await this.whatsappService.hasNotificationBeenSent('match_finished', match.id);
    if (alreadySent) return;

    const now = new Date();
    const brtDateStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const todayStart = new Date(`${brtDateStr}T00:00:00-03:00`);
    const todayEnd = new Date(`${brtDateStr}T23:59:59-03:00`);
    if (match.matchDate < todayStart || match.matchDate > todayEnd) return;

    const top5 = ranking.slice(0, 5);
    const topLeaders = top5.map((r) => {
      const pred = predictions.find((p) => p.userId === r.id);
      return {
        position: r.position,
        userName: r.fullName,
        totalScore: r.score,
        predictedHome: pred?.predictedHome ?? null,
        predictedAway: pred?.predictedAway ?? null,
        pointsEarned: pred?.pointsEarned ?? null,
      };
    });

    const matchOk = await this.whatsappService.sendMatchFinishedNotification(
      match.teamHome,
      match.teamAway,
      match.homeScore ?? 0,
      match.awayScore ?? 0,
      topLeaders,
      match.teamHomeIso,
      match.teamAwayIso,
    );

    if (matchOk) {
      await this.whatsappService.recordNotification('match_finished', match.id, true);
    }

    if (matchOk) {
      this.logger.log(`Notificação WhatsApp enviada para partida ${match.id}`);
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
