import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class RankingService {
  constructor(private prisma: PrismaService) {}

  async getRanking(limit = 50) {
    const [config, paidUsersCount] = await Promise.all([
      this.prisma.systemConfig.findFirst(),
      this.prisma.user.count({ where: { hasPaid: true, isActive: true } }),
    ]);
    const betAmount = Number(config?.betAmount ?? 20);
    const prizePool = paidUsersCount * betAmount;

    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        fullName: true,
        username: true,
        hasPaid: true,
        paidAt: true,
        createdAt: true,
        predictions: {
          select: { pointsEarned: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: { userAchievements: true },
        },
      },
    });

    const mapped = users.map((user) => {
      const totalScore = user.predictions.reduce(
        (sum, p) => sum + (p.pointsEarned || 0), 0,
      );
      const exactHits = user.predictions.filter(
        (p) => p.pointsEarned === 5,
      ).length;
      const winnerHits = user.predictions.filter(
        (p) => (p.pointsEarned || 0) >= 3 && p.pointsEarned !== 5,
      ).length;
      const totalPredictions = user.predictions.length;
      const predictionDates = user.predictions.map((p) => p.createdAt.getTime());
      return {
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        hasPaid: user.hasPaid,
        paidAt: user.paidAt,
        createdAt: user.createdAt,
        predictionDates,
        score: totalScore,
        exactHits,
        winnerHits,
        totalPredictions,
        achievements: user._count.userAchievements,
      };
    });

    const ranking = this.sortWithTiebreakers(mapped)
      .slice(0, limit)
      .map((user, index) => ({
        position: index + 1,
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        hasPaid: user.hasPaid,
        score: user.score,
        exactHits: user.exactHits,
        winnerHits: user.winnerHits,
        totalPredictions: user.totalPredictions,
        achievements: user.achievements,
      }));

    const prizes = await this.calculatePrizes(prizePool);

    return ranking.map((entry) => ({
      ...entry,
      prize: prizes[entry.id] ?? null,
    }));
  }

  private sortWithTiebreakers(users: any[]) {
    return users.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.exactHits !== a.exactHits) return b.exactHits - a.exactHits;
      if (b.winnerHits !== a.winnerHits) return b.winnerHits - a.winnerHits;
      if ((b.totalPredictions ?? 0) !== (a.totalPredictions ?? 0))
        return (b.totalPredictions ?? 0) - (a.totalPredictions ?? 0);
      const datesA: number[] = a.predictionDates ?? [];
      const datesB: number[] = b.predictionDates ?? [];
      for (let i = 0; i < Math.max(datesA.length, datesB.length); i++) {
        const dA = i < datesA.length ? datesA[i] : Infinity;
        const dB = i < datesB.length ? datesB[i] : Infinity;
        if (dA !== dB) return dA - dB;
      }
      const paidA = a.paidAt?.getTime();
      const paidB = b.paidAt?.getTime();
      if ((paidA != null) !== (paidB != null)) return paidA != null ? -1 : 1;
      if (paidA != null && paidB != null && paidA !== paidB) return paidA - paidB;
      const createdA = a.createdAt.getTime();
      const createdB = b.createdAt.getTime();
      if (createdA !== createdB) return createdA - createdB;
      return 0;
    });
  }

  private async calculatePrizes(prizePool: number): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    if (prizePool <= 0) return result;

    const users = await this.prisma.user.findMany({
      where: { hasPaid: true, isActive: true },
      select: {
        id: true,
        paidAt: true,
        createdAt: true,
        predictions: {
          select: { pointsEarned: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    const qualifiers = users
      .map((u) => ({
        id: u.id,
        score: u.predictions.reduce((s, p) => s + (p.pointsEarned || 0), 0),
        exactHits: u.predictions.filter((p) => p.pointsEarned === 5).length,
        winnerHits: u.predictions.filter((p) => (p.pointsEarned || 0) >= 3 && p.pointsEarned !== 5).length,
        totalPredictions: u.predictions.length,
        predictionDates: u.predictions.map((p: any) => p.createdAt.getTime()),
        paidAt: u.paidAt,
        createdAt: u.createdAt,
      }))
      .filter((u) => u.score > 0);

    this.sortWithTiebreakers(qualifiers);

    const Q = qualifiers.length;
    let pct: number[];
    if (Q >= 3) pct = [0.6, 0.25, 0.15];
    else if (Q === 2) pct = [0.7, 0.3];
    else if (Q === 1) pct = [1.0];
    else return result;

    for (let k = 0; k < pct.length; k++) {
      result[qualifiers[k].id] = Math.round(prizePool * pct[k] * 100) / 100;
    }
    return result;
  }

  async getUserPosition(userId: string) {
    const ranking = await this.getRanking();
    const entry = ranking.find((u) => u.id === userId) || null;
    return entry;
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async recordDailySnapshot() {
    const ranking = await this.getRanking();
    for (const entry of ranking) {
      await this.prisma.rankingHistory.create({
        data: {
          userId: entry.id,
          position: entry.position,
          score: entry.score,
        },
      });
    }
  }

  async getHistory(userId: string) {
    return this.prisma.rankingHistory.findMany({
      where: { userId },
      orderBy: { recordedAt: 'asc' },
      take: 30,
    });
  }

  async getUserPredictions(userId: string, filters?: {
    phase?: string;
    groupLabel?: string;
    team?: string;
    points?: number;
  }) {
    const where: any = {
      userId,
      match: {
        status: 'FINISHED',
        homeScore: { not: null },
        awayScore: { not: null },
      },
    };

    if (filters?.phase) where.match.phase = filters.phase;
    if (filters?.groupLabel) where.match.groupLabel = filters.groupLabel;
    if (filters?.team) {
      where.match.OR = [
        { teamHome: { contains: filters.team, mode: 'insensitive' } },
        { teamAway: { contains: filters.team, mode: 'insensitive' } },
      ];
    }
    if (filters?.points !== undefined) where.pointsEarned = filters.points;

    const predictions = await this.prisma.prediction.findMany({
      where,
      include: {
        match: true,
      },
      orderBy: { match: { matchDate: 'asc' } },
    });

    return predictions.map((p) => ({
      id: p.id,
      matchId: p.matchId,
      predictedHome: p.predictedHome,
      predictedAway: p.predictedAway,
      pointsEarned: p.pointsEarned ?? 0,
      createdAt: p.createdAt,
      match: {
        teamHome: p.match.teamHome,
        teamAway: p.match.teamAway,
        flagHome: p.match.flagHome,
        flagAway: p.match.flagAway,
        homeScore: p.match.homeScore,
        awayScore: p.match.awayScore,
        matchDate: p.match.matchDate,
        phase: p.match.phase,
        groupLabel: p.match.groupLabel,
        status: p.match.status,
      },
      statusLabel: this.getPredictionStatusLabel(
        p.pointsEarned ?? 0,
        p.match.homeScore ?? 0,
        p.match.awayScore ?? 0,
        p.predictedHome,
        p.predictedAway,
      ),
    }));
  }

  private getPredictionStatusLabel(
    pointsEarned: number,
    actualHome: number,
    actualAway: number,
    predictedHome: number,
    predictedAway: number,
  ): string {
    if (pointsEarned === 5) return 'Placar Exato';
    if (pointsEarned === 3) {
      const actualIsDraw = actualHome === actualAway;
      const predictedIsDraw = predictedHome === predictedAway;
      if (actualIsDraw && predictedIsDraw) return 'Acertou Empate';
      return 'Acertou Vencedor';
    }
    return 'Errou';
  }

  async getPrizeRules() {
    const [config, paidUsersCount] = await Promise.all([
      this.prisma.systemConfig.findFirst(),
      this.prisma.user.count({ where: { hasPaid: true, isActive: true } }),
    ]);
    const betAmount = Number(config?.betAmount ?? 20);
    const totalCollected = paidUsersCount * betAmount;

    const distributionTable = [
      { qualifiers: '3 ou mais', first: '60%', second: '25%', third: '15%' },
      { qualifiers: '2', first: '70%', second: '30%', third: '—' },
      { qualifiers: '1', first: '100%', second: '—', third: '—' },
    ];

    return {
      paidUsers: paidUsersCount,
      registrationFee: betAmount,
      totalCollected,
      prizePool: totalCollected,
      distributionTable,
      rules: [
        'Apenas participantes com pontuação maior que zero concorrem à premiação.',
        '3 ou mais qualificados: 1º=60%, 2º=25%, 3º=15%.',
        '2 qualificados: 1º=70%, 2º=30% (sem 3º lugar).',
        '1 qualificado: 1º=100% (sem 2º ou 3º lugar).',
        'Nenhum qualificado: nenhuma premiação distribuída.',
        'Critérios de desempate (sequencial): maior pontuação → mais placares exatos → mais acertos de vencedor → mais palpites realizados → total de palpites mais antigo (comparação sequencial) → pagamento mais antigo → cadastro mais antigo.',
        'Não há divisão de prêmio por empate.',
      ],
    };
  }
}
