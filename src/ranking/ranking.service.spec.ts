import { Test, TestingModule } from '@nestjs/testing';
import { RankingService } from './ranking.service';
import { PrismaService } from '../common/prisma.service';

describe('RankingService', () => {
  let service: RankingService;
  let prisma: any;

  const mockPrisma = {
    user: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    rankingHistory: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RankingService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RankingService>(RankingService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getRanking', () => {
    it('deve retornar ranking ordenado por score e exactHits', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: '1', fullName: 'User A', username: 'usera', hasPaid: true,
          predictions: [{ pointsEarned: 5 }, { pointsEarned: 3 }, { pointsEarned: 0 }],
          _count: { userAchievements: 1 },
        },
        {
          id: '2', fullName: 'User B', username: 'userb', hasPaid: false,
          predictions: [{ pointsEarned: 5 }, { pointsEarned: 5 }, { pointsEarned: 3 }],
          _count: { userAchievements: 0 },
        },
        {
          id: '3', fullName: 'User C', username: 'userc', hasPaid: true,
          predictions: [{ pointsEarned: 5 }, { pointsEarned: 5 }, { pointsEarned: 0 }],
          _count: { userAchievements: 2 },
        },
      ]);

      mockPrisma.user.count.mockResolvedValue(2);
      jest.spyOn(service as any, 'calculatePrizes').mockResolvedValue({ '1': 12.0 });

      const ranking = await service.getRanking();

      expect(ranking).toHaveLength(3);
      expect(ranking[0].position).toBe(1);
      expect(ranking[0].id).toBe('2');
      expect(ranking[0].score).toBe(13);
      expect(ranking[0].exactHits).toBe(2);

      expect(ranking[1].position).toBe(2);
      expect(ranking[1].id).toBe('3');
      expect(ranking[1].score).toBe(10);
      expect(ranking[1].exactHits).toBe(2);

      expect(ranking[2].position).toBe(3);
      expect(ranking[2].id).toBe('1');
      expect(ranking[2].score).toBe(8);
      expect(ranking[2].exactHits).toBe(1);

      expect(ranking[0].hasPaid).toBe(false);
      expect(ranking[1].hasPaid).toBe(true);
      expect(ranking[2].hasPaid).toBe(true);
      expect(ranking[2].prize).toBe(12.0);
      expect(ranking[0].prize).toBeNull();
    });

    it('deve retornar apenas usuários ativos', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      const ranking = await service.getRanking();

      expect(ranking).toHaveLength(0);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });

    it('deve respeitar o limite máximo de resultados', async () => {
      const users = Array.from({ length: 60 }, (_, i) => ({
        id: `${i}`, fullName: `User ${i}`, username: `user${i}`, hasPaid: false,
        predictions: [{ pointsEarned: 3 }],
        _count: { userAchievements: 0 },
      }));
      mockPrisma.user.findMany.mockResolvedValue(users);
      mockPrisma.user.count.mockResolvedValue(0);

      const ranking = await service.getRanking(50);
      expect(ranking).toHaveLength(50);
    });
  });

  describe('calculatePrizes', () => {
    it('deve retornar vazio se não houver paid users', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      const result = await (service as any).calculatePrizes();
      expect(result).toEqual({});
    });

    it('deve retornar vazio se prizePool for zero', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      const result = await (service as any).calculatePrizes();
      expect(result).toEqual({});
    });

    it('deve retornar vazio se nenhum qualifier tiver score > 0', async () => {
      mockPrisma.user.count.mockResolvedValue(3);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: '1', predictions: [{ pointsEarned: 0 }, { pointsEarned: 0 }] },
        { id: '2', predictions: [{ pointsEarned: 0 }] },
      ]);

      const result = await (service as any).calculatePrizes();
      expect(result).toEqual({});
    });

    it('deve dar 100% para único qualificador', async () => {
      mockPrisma.user.count.mockResolvedValue(5);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: '1', predictions: [{ pointsEarned: 10 }] },
        { id: '2', predictions: [{ pointsEarned: 0 }] },
        { id: '3', predictions: [{ pointsEarned: 0 }] },
      ]);

      const result = await (service as any).calculatePrizes();
      const expectedPool = 5 * 20;
      expect(result['1']).toBeCloseTo(expectedPool);
      expect(Object.keys(result)).toHaveLength(1);
    });

    it('deve dividir ~70,6/29,4 entre 2 qualificadores', async () => {
      mockPrisma.user.count.mockResolvedValue(3);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: '1', predictions: [{ pointsEarned: 10 }] },
        { id: '2', predictions: [{ pointsEarned: 5 }] },
      ]);

      const result = await (service as any).calculatePrizes();
      const expectedPool = 3 * 20;
      expect(result['1']).toBeCloseTo(Math.round(expectedPool * (60 / 85) * 100) / 100);
      expect(result['2']).toBeCloseTo(Math.round(expectedPool * (25 / 85) * 100) / 100);
    });

    it('deve dividir 60/25/15 entre 3 qualificadores', async () => {
      mockPrisma.user.count.mockResolvedValue(10);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: '1', predictions: [{ pointsEarned: 15 }] },
        { id: '2', predictions: [{ pointsEarned: 10 }] },
        { id: '3', predictions: [{ pointsEarned: 5 }] },
      ]);

      const result = await (service as any).calculatePrizes();
      const expectedPool = 10 * 20;
      expect(result['1']).toBeCloseTo(Math.round(expectedPool * 0.6 * 100) / 100);
      expect(result['2']).toBeCloseTo(Math.round(expectedPool * 0.25 * 100) / 100);
      expect(result['3']).toBeCloseTo(Math.round(expectedPool * 0.15 * 100) / 100);
    });

    it('deve dividir 60/25/15 entre 4+ qualificadores (apenas top 3)', async () => {
      mockPrisma.user.count.mockResolvedValue(10);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: '1', predictions: [{ pointsEarned: 20 }] },
        { id: '2', predictions: [{ pointsEarned: 15 }] },
        { id: '3', predictions: [{ pointsEarned: 10 }] },
        { id: '4', predictions: [{ pointsEarned: 5 }] },
        { id: '5', predictions: [{ pointsEarned: 2 }] },
      ]);

      const result = await (service as any).calculatePrizes();
      expect(Object.keys(result)).toHaveLength(3);
    });

    it('deve dividir prêmio igualmente entre empatados no 1º lugar', async () => {
      mockPrisma.user.count.mockResolvedValue(10);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: '1', predictions: [{ pointsEarned: 10 }] },
        { id: '2', predictions: [{ pointsEarned: 10 }] },
        { id: '3', predictions: [{ pointsEarned: 5 }] },
      ]);

      const result = await (service as any).calculatePrizes();
      const expectedPool = 10 * 20;
      const combined = Math.round(expectedPool * (0.6 + 0.25) * 100) / 100;
      const perUser = Math.round((combined / 2) * 100) / 100;
      expect(result['1']).toBeCloseTo(perUser);
      expect(result['2']).toBeCloseTo(perUser);
      expect(result['3']).toBeCloseTo(Math.round(expectedPool * 0.15 * 100) / 100);
    });

    it('deve dividir prêmio igualmente entre 3 empatados no 1º lugar', async () => {
      mockPrisma.user.count.mockResolvedValue(10);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: '1', predictions: [{ pointsEarned: 10 }] },
        { id: '2', predictions: [{ pointsEarned: 10 }] },
        { id: '3', predictions: [{ pointsEarned: 10 }] },
      ]);

      const result = await (service as any).calculatePrizes();
      const expectedPool = 10 * 20;
      const combined = Math.round(expectedPool * (0.6 + 0.25 + 0.15) * 100) / 100;
      const perUser = Math.round((combined / 3) * 100) / 100;
      expect(result['1']).toBeCloseTo(perUser);
      expect(result['2']).toBeCloseTo(perUser);
      expect(result['3']).toBeCloseTo(perUser);
    });

    it('deve usar apenas paid users como base do prize pool', async () => {
      mockPrisma.user.count.mockResolvedValue(4);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: '1', predictions: [{ pointsEarned: 10 }] },
        { id: '2', predictions: [{ pointsEarned: 5 }] },
      ]);

      const result = await (service as any).calculatePrizes();
      const expectedPool = 4 * 20;
      const firstPct = Math.round(expectedPool * (60 / 85) * 100) / 100;
      const secondPct = Math.round(expectedPool * (25 / 85) * 100) / 100;
      expect(result['1']).toBeCloseTo(firstPct);
      expect(result['2']).toBeCloseTo(secondPct);
    });
  });

  describe('getUserPosition', () => {
    it('deve retornar entry do usuário no ranking', async () => {
      jest.spyOn(service, 'getRanking').mockResolvedValue([
        { position: 1, id: '1', fullName: 'A', username: 'a', hasPaid: true, score: 10, exactHits: 2, achievements: 0, prize: 10 },
        { position: 2, id: '2', fullName: 'B', username: 'b', hasPaid: false, score: 5, exactHits: 1, achievements: 0, prize: 0 },
      ]);

      const result = await service.getUserPosition('1');
      expect(result).toEqual({
        position: 1, id: '1', fullName: 'A', username: 'a', hasPaid: true, score: 10, exactHits: 2, achievements: 0, prize: 10,
      });
    });

    it('deve retornar null para usuário fora do ranking', async () => {
      jest.spyOn(service, 'getRanking').mockResolvedValue([]);
      const result = await service.getUserPosition('999');
      expect(result).toBeNull();
    });
  });

  describe('getPrizeRules', () => {
    it('deve retornar regras com valores corretos', async () => {
      mockPrisma.user.count.mockResolvedValue(10);
      const rules = await service.getPrizeRules();

      expect(rules.paidUsers).toBe(10);
      expect(rules.registrationFee).toBe(20);
      expect(rules.totalCollected).toBe(200);
      expect(rules.prizePool).toBe(200);
      expect(rules.distributionTable).toHaveLength(4);
      expect(rules.distributionTable[0]).toEqual({
        qualifiers: '3 ou mais', first: '60%', second: '25%', third: '15%',
      });
      expect(rules.rules).toHaveLength(6);
    });
  });

  describe('recordDailySnapshot', () => {
    it('deve criar histórico para cada entry do ranking', async () => {
      jest.spyOn(service, 'getRanking').mockResolvedValue([
        { position: 1, id: '1', fullName: 'A', username: 'a', hasPaid: true, score: 10, exactHits: 2, achievements: 0, prize: 10 },
        { position: 2, id: '2', fullName: 'B', username: 'b', hasPaid: false, score: 5, exactHits: 1, achievements: 0, prize: 0 },
      ]);

      await service.recordDailySnapshot();

      expect(mockPrisma.rankingHistory.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.rankingHistory.create).toHaveBeenCalledWith({
        data: { userId: '1', position: 1, score: 10 },
      });
      expect(mockPrisma.rankingHistory.create).toHaveBeenCalledWith({
        data: { userId: '2', position: 2, score: 5 },
      });
    });
  });

  describe('getHistory', () => {
    it('deve retornar histórico ordenado por data ascendente', async () => {
      mockPrisma.rankingHistory.findMany.mockResolvedValue([
        { id: '1', userId: '1', position: 3, score: 5, recordedAt: new Date('2026-06-01') },
        { id: '2', userId: '1', position: 1, score: 10, recordedAt: new Date('2026-06-02') },
      ]);

      const history = await service.getHistory('1');

      expect(history).toHaveLength(2);
      expect(mockPrisma.rankingHistory.findMany).toHaveBeenCalledWith({
        where: { userId: '1' },
        orderBy: { recordedAt: 'asc' },
        take: 30,
      });
    });
  });
});
