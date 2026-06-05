import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class GamificationService {
  constructor(private prisma: PrismaService) {}

  async getUserAchievements(userId: string) {
    return this.prisma.userAchievement.findMany({
      where: { userId },
      include: {
        achievement: true,
      },
      orderBy: { earnedAt: 'desc' },
    });
  }

  async checkAndAwardAchievements(userId: string) {
    const allAchievements = await this.prisma.achievement.findMany();
    const userAchievements = await this.prisma.userAchievement.findMany({
      where: { userId },
    });
    const existingIds = new Set(userAchievements.map((ua) => ua.achievementId));

    const userPredictions = await this.prisma.prediction.findMany({
      where: { userId, pointsEarned: { not: null } },
    });

    const correctPredictions = userPredictions.filter(
      (p) => (p.pointsEarned || 0) > 0,
    );
    const correctResults = correctPredictions.length;
    const exactResults = correctPredictions.filter((p) => p.pointsEarned === 5).length;
    const totalScore = userPredictions.reduce((sum, p) => sum + (p.pointsEarned || 0), 0);

    const toAward: string[] = [];

    if (userPredictions.length >= 1) toAward.push('Primeiro Palpite');
    if (correctResults >= 1) toAward.push('Primeiro Acerto');
    if (exactResults >= 1) toAward.push('Placar Exato');
    if (correctResults >= 3) toAward.push('3 Acertos Seguidos');
    if (correctResults >= 10) toAward.push('10 Jogos Acertados');
    if (totalScore >= 50) toAward.push('50 Pontos');
    if (totalScore >= 100) toAward.push('100 Pontos');
    if (correctResults >= 15) toAward.push('Bronze');
    const correctScoreDiffs = correctPredictions.filter((p) => p.pointsEarned === 3).length;
    if (correctScoreDiffs >= 5) toAward.push('Prata');
    if (exactResults >= 3) toAward.push('Ouro');

    const awarded: string[] = [];

    for (const achievement of allAchievements) {
      if (existingIds.has(achievement.id)) continue;
      if (toAward.includes(achievement.name)) {
        await this.prisma.userAchievement.create({
          data: { userId, achievementId: achievement.id },
        });
        awarded.push(achievement.name);
      }
    }

    return { awarded, total: allAchievements.length };
  }

  async getAllAchievements() {
    return this.prisma.achievement.findMany({
      orderBy: { name: 'asc' },
    });
  }
}
