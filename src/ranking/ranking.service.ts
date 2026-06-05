import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class RankingService {
  constructor(private prisma: PrismaService) {}

  async getRanking(limit = 50) {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        fullName: true,
        username: true,
        hasPaid: true,
        predictions: {
          select: { pointsEarned: true },
        },
        _count: {
          select: { userAchievements: true },
        },
      },
    });

    const ranking = users
      .map((user) => {
        const totalScore = user.predictions.reduce(
          (sum, p) => sum + (p.pointsEarned || 0),
          0,
        );
        const exactHits = user.predictions.filter(
          (p) => p.pointsEarned === 5,
        ).length;
        return {
          id: user.id,
          fullName: user.fullName,
          username: user.username,
          hasPaid: user.hasPaid,
          score: totalScore,
          exactHits,
          achievements: user._count.userAchievements,
        };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.exactHits - a.exactHits;
      })
      .slice(0, limit)
      .map((user, index) => ({
        position: index + 1,
        ...user,
      }));

    const prizes = await this.calculatePrizes();

    return ranking.map((entry) => ({
      ...entry,
      prize: prizes[entry.id] ?? null,
    }));
  }

  private async calculatePrizes(): Promise<Record<string, number>> {
    const paidUsers = await this.prisma.user.count({
      where: { hasPaid: true, isActive: true },
    });
    const prizePool = paidUsers * 20;
    if (paidUsers === 0 || prizePool <= 0) return {};

    const users = await this.prisma.user.findMany({
      where: { hasPaid: true, isActive: true },
      select: {
        id: true,
        predictions: { select: { pointsEarned: true } },
      },
    });

    const qualifiers = users
      .map((u) => ({
        id: u.id,
        score: u.predictions.reduce((s, p) => s + (p.pointsEarned || 0), 0),
      }))
      .filter((u) => u.score > 0)
      .sort((a, b) => b.score - a.score);

    const Q = qualifiers.length;
    if (Q === 0) return {};

    const percents =
      Q >= 3 ? [0.6, 0.25, 0.15] : Q === 2 ? [60 / 85, 25 / 85] : [1.0];

    const result: Record<string, number> = {};
    let i = 0;
    while (i < Q && i < percents.length) {
      let j = i + 1;
      while (j < Q && qualifiers[j].score === qualifiers[i].score) {
        j++;
      }
      const tiedCount = j - i;
      const combinedPct = percents.slice(i, j).reduce((s, p) => s + p, 0);
      const totalPrize = Math.round(prizePool * combinedPct * 100) / 100;
      const perUser = Math.round((totalPrize / tiedCount) * 100) / 100;
      for (let k = i; k < j; k++) {
        result[qualifiers[k].id] = perUser;
      }
      i = j;
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

  async getPrizeRules() {
    const paidUsersCount = await this.prisma.user.count({
      where: { hasPaid: true, isActive: true },
    });
    const registrationFee = 20;
    const total = paidUsersCount * registrationFee;
    const prizePool = total;

    const distributionTable = [
      { qualifiers: '3 ou mais', first: '60%', second: '25%', third: '15%' },
      { qualifiers: '2', first: '~70,6%', second: '~29,4%', third: '—' },
      { qualifiers: '1', first: '100%', second: '—', third: '—' },
      { qualifiers: '0', first: '—', second: '—', third: '—' },
    ];

    return {
      paidUsers: paidUsersCount,
      registrationFee,
      totalCollected: total,
      prizePool,
      distributionTable,
      rules: [
        'Apenas usuários com pagamento confirmado concorrem à premiação.',
        'Apenas usuários com pontuação maior que zero concorrem à premiação.',
        'A ordem do ranking para premiação considera apenas os usuários que pontuaram.',
        'Quando apenas 2 usuários pontuam, os percentuais são recalculados proporcionalmente: 1º ~70,6%, 2º ~29,4%.',
        'Quando apenas 1 usuário pontua, ele recebe 100% da premiação.',
        'Em caso de empate em qualquer posição, o valor correspondente é dividido igualmente entre os empatados.',
      ],
    };
  }
}
