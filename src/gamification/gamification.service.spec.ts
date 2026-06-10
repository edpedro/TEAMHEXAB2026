import { Test, TestingModule } from '@nestjs/testing';
import { GamificationService } from './gamification.service';
import { PrismaService } from '../common/prisma.service';

describe('GamificationService', () => {
  let service: GamificationService;
  let prisma: any;

  const mockPrisma = {
    userAchievement: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    achievement: {
      findMany: jest.fn(),
    },
    prediction: {
      findMany: jest.fn(),
    },
  };

  const achievements = [
    { id: 'a1', name: 'Primeiro Palpite', description: 'Faça seu primeiro palpite' },
    { id: 'a2', name: 'Primeiro Acerto', description: 'Acerta o resultado' },
    { id: 'a3', name: 'Placar Exato', description: 'Acerta o placar exato' },
    { id: 'a4', name: '3 Acertos Seguidos', description: '3 acertos' },
    { id: 'a5', name: '50 Pontos', description: '50 pontos' },
    { id: 'a6', name: '100 Pontos', description: '100 pontos' },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GamificationService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<GamificationService>(GamificationService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserAchievements', () => {
    it('deve retornar conquistas do usuário', async () => {
      const userAchievements = [
        { id: 'ua1', userId: 'user-1', achievementId: 'a1', earnedAt: new Date(), achievement: achievements[0] },
      ];
      mockPrisma.userAchievement.findMany.mockResolvedValue(userAchievements);

      const result = await service.getUserAchievements('user-1');
      expect(result).toHaveLength(1);
      expect(mockPrisma.userAchievement.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        include: { achievement: true },
        orderBy: { earnedAt: 'desc' },
      });
    });
  });

  describe('getAllAchievements', () => {
    it('deve retornar todas as conquistas', async () => {
      mockPrisma.achievement.findMany.mockResolvedValue(achievements);

      const result = await service.getAllAchievements();
      expect(result).toHaveLength(6);
    });
  });

  describe('checkAndAwardAchievements', () => {
    it('deve conceder Primeiro Palpite quando usuário tem 1+ predictions', async () => {
      mockPrisma.achievement.findMany.mockResolvedValue(achievements);
      mockPrisma.userAchievement.findMany.mockResolvedValue([]);
      mockPrisma.prediction.findMany.mockResolvedValue([
        { id: 'p1', pointsEarned: 3 },
      ]);
      mockPrisma.userAchievement.create.mockResolvedValue({});

      const result = await service.checkAndAwardAchievements('user-1');

      expect(result.awarded).toContain('Primeiro Palpite');
      expect(result.awarded).toContain('Primeiro Acerto');
      expect(mockPrisma.userAchievement.create).toHaveBeenCalledTimes(2);
    });

    it('não deve conceder conquistas já existentes', async () => {
      mockPrisma.achievement.findMany.mockResolvedValue(achievements);
      mockPrisma.userAchievement.findMany.mockResolvedValue([
        { achievementId: 'a1' },
      ]);
      mockPrisma.prediction.findMany.mockResolvedValue([
        { id: 'p1', pointsEarned: 5 },
      ]);

      const result = await service.checkAndAwardAchievements('user-1');

      expect(result.awarded).not.toContain('Primeiro Palpite');
      expect(result.awarded).toContain('Placar Exato');
    });

    it('deve conceder 50 Pontos quando total >= 50', async () => {
      mockPrisma.achievement.findMany.mockResolvedValue(achievements);
      mockPrisma.userAchievement.findMany.mockResolvedValue([]);
      const predictions = Array.from({ length: 10 }, (_, i) => ({
        id: `p${i}`,
        pointsEarned: 5,
      }));
      mockPrisma.prediction.findMany.mockResolvedValue(predictions);

      const result = await service.checkAndAwardAchievements('user-1');

      expect(result.awarded).toContain('50 Pontos');
    });

    it('deve conceder 100 Pontos quando total >= 100', async () => {
      mockPrisma.achievement.findMany.mockResolvedValue(achievements);
      mockPrisma.userAchievement.findMany.mockResolvedValue([]);
      const predictions = Array.from({ length: 20 }, (_, i) => ({
        id: `p${i}`,
        pointsEarned: 5,
      }));
      mockPrisma.prediction.findMany.mockResolvedValue(predictions);

      const result = await service.checkAndAwardAchievements('user-1');

      expect(result.awarded).toContain('100 Pontos');
    });

    it('não deve conceder nada se usuário não tem predictions', async () => {
      mockPrisma.achievement.findMany.mockResolvedValue(achievements);
      mockPrisma.userAchievement.findMany.mockResolvedValue([]);
      mockPrisma.prediction.findMany.mockResolvedValue([]);

      const result = await service.checkAndAwardAchievements('user-1');

      expect(result.awarded).toHaveLength(0);
    });

    it('deve retornar total de achievements disponíveis', async () => {
      mockPrisma.achievement.findMany.mockResolvedValue(achievements);
      mockPrisma.userAchievement.findMany.mockResolvedValue([]);
      mockPrisma.prediction.findMany.mockResolvedValue([]);

      const result = await service.checkAndAwardAchievements('user-1');

      expect(result.total).toBe(6);
    });
  });
});
