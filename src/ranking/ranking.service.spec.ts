import { Test, TestingModule } from '@nestjs/testing';
import { RankingService } from './ranking.service';
import { PrismaService } from '../common/prisma.service';

describe('RankingService', () => {
  let service: RankingService;
  let prisma: any;

  const mockPrisma = {
    systemConfig: {
      findFirst: jest.fn(),
    },
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

  function makeUser(overrides: any = {}) {
    return {
      id: 'x',
      fullName: 'User',
      username: 'user',
      hasPaid: false,
      paidAt: null,
      createdAt: new Date('2026-06-01T12:00:00Z'),
      predictions: [],
      _count: { userAchievements: 0 },
      ...overrides,
    };
  }

  function pred(points: number, createdAt?: string) {
    return { pointsEarned: points, createdAt: createdAt ? new Date(createdAt) : new Date('2026-06-01T12:00:00Z') };
  }

  describe('sortWithTiebreakers', () => {
    it('deve ordenar por pontuação decrescente', () => {
      const users = [
        makeUser({ id: '1', predictions: [pred(5), pred(3)] }),
        makeUser({ id: '2', predictions: [pred(5), pred(5), pred(3)] }),
      ];
      mockPrisma.systemConfig.findFirst.mockResolvedValue({ betAmount: 20 });
      mockPrisma.user.count.mockResolvedValue(2);
      mockPrisma.user.findMany.mockResolvedValue(users);
      jest.spyOn(service as any, 'calculatePrizes').mockResolvedValue({});

      return service.getRanking().then(r => {
        expect(r[0].id).toBe('2');
        expect(r[0].score).toBe(13);
        expect(r[1].id).toBe('1');
        expect(r[1].score).toBe(8);
      });
    });

    it('deve desempatar por placares exatos', () => {
      const users = [
        makeUser({ id: '1', fullName: 'User A', predictions: [pred(5), pred(3), pred(0)], createdAt: new Date('2026-06-01T12:00:00Z') }),
        makeUser({ id: '2', fullName: 'User B', predictions: [pred(5), pred(5), pred(3)], createdAt: new Date('2026-06-01T12:00:00Z') }),
        makeUser({ id: '3', fullName: 'User C', predictions: [pred(5), pred(5), pred(0)], createdAt: new Date('2026-06-01T12:00:00Z') }),
      ];
      mockPrisma.systemConfig.findFirst.mockResolvedValue({ betAmount: 20 });
      mockPrisma.user.count.mockResolvedValue(2);
      mockPrisma.user.findMany.mockResolvedValue(users);
      jest.spyOn(service as any, 'calculatePrizes').mockResolvedValue({});

      return service.getRanking().then(r => {
        expect(r[0].score).toBe(13);
        expect(r[0].exactHits).toBe(2);
        expect(r[1].score).toBe(10);
        expect(r[1].exactHits).toBe(2);
        expect(r[2].score).toBe(8);
        expect(r[2].exactHits).toBe(1);
      });
    });

    it('deve desempatar por pagamento mais recente (paidAt)', () => {
      const users = [
        makeUser({ id: '1', predictions: [pred(5)], paidAt: new Date('2026-06-05T12:00:00Z'), createdAt: new Date('2026-06-01T12:00:00Z') }),
        makeUser({ id: '2', predictions: [pred(5)], paidAt: new Date('2026-06-03T12:00:00Z'), createdAt: new Date('2026-06-01T12:00:00Z') }),
      ];
      mockPrisma.systemConfig.findFirst.mockResolvedValue({ betAmount: 20 });
      mockPrisma.user.count.mockResolvedValue(2);
      mockPrisma.user.findMany.mockResolvedValue(users);
      jest.spyOn(service as any, 'calculatePrizes').mockResolvedValue({});

      return service.getRanking().then(r => {
        expect(r[0].id).toBe('1');
        expect(r[1].id).toBe('2');
      });
    });

    it('deve desempatar por cadastro mais recente (createdAt)', () => {
      const users = [
        makeUser({ id: '1', predictions: [pred(5)], paidAt: null, createdAt: new Date('2026-06-05T12:00:00Z') }),
        makeUser({ id: '2', predictions: [pred(5)], paidAt: null, createdAt: new Date('2026-06-03T12:00:00Z') }),
      ];
      mockPrisma.systemConfig.findFirst.mockResolvedValue({ betAmount: 20 });
      mockPrisma.user.count.mockResolvedValue(2);
      mockPrisma.user.findMany.mockResolvedValue(users);
      jest.spyOn(service as any, 'calculatePrizes').mockResolvedValue({});

      return service.getRanking().then(r => {
        expect(r[0].id).toBe('1');
        expect(r[1].id).toBe('2');
      });
    });

    it('deve desempatar por primeiro palpite mais recente (firstPredictionAt)', () => {
      const users = [
        makeUser({
          id: '1', predictions: [pred(5, '2026-06-05T12:00:00Z')],
          paidAt: null, createdAt: new Date('2026-06-01T12:00:00Z'),
        }),
        makeUser({
          id: '2', predictions: [pred(5, '2026-06-03T12:00:00Z')],
          paidAt: null, createdAt: new Date('2026-06-01T12:00:00Z'),
        }),
      ];
      mockPrisma.systemConfig.findFirst.mockResolvedValue({ betAmount: 20 });
      mockPrisma.user.count.mockResolvedValue(2);
      mockPrisma.user.findMany.mockResolvedValue(users);
      jest.spyOn(service as any, 'calculatePrizes').mockResolvedValue({});

      return service.getRanking().then(r => {
        expect(r[0].id).toBe('1');
        expect(r[1].id).toBe('2');
      });
    });

    it('Usuário A 100pts 20exatos acima de Usuário B 100pts 8exatos', () => {
      const users = [
        makeUser({ id: 'A', fullName: 'User A', predictions: Array(20).fill(null).map(() => pred(5)), createdAt: new Date('2026-06-01T12:00:00Z') }),
        makeUser({ id: 'B', fullName: 'User B', predictions: [...Array(8).fill(null).map(() => pred(5)), ...Array(20).fill(null).map(() => pred(3))], createdAt: new Date('2026-06-01T12:00:00Z') }),
      ];
      mockPrisma.systemConfig.findFirst.mockResolvedValue({ betAmount: 20 });
      mockPrisma.user.count.mockResolvedValue(2);
      mockPrisma.user.findMany.mockResolvedValue(users);
      jest.spyOn(service as any, 'calculatePrizes').mockResolvedValue({});

      return service.getRanking().then(r => {
        const a = r.find(u => u.id === 'A')!;
        const b = r.find(u => u.id === 'B')!;
        expect(a.score).toBe(100);
        expect(a.exactHits).toBe(20);
        expect(b.score).toBe(100);
        expect(b.exactHits).toBe(8);
        expect(a.position).toBeLessThan(b.position);
      });
    });

    it('deve desempatar por acertos de vencedor (winnerHits)', () => {
      const users = [
        makeUser({ id: 'C', fullName: 'User C', predictions: [pred(5), pred(5), pred(3), pred(3), pred(3), pred(3), pred(3), pred(3), pred(3), pred(3)], createdAt: new Date('2026-06-01T12:00:00Z') }),
        makeUser({ id: 'D', fullName: 'User D', predictions: [pred(5), pred(5), pred(3), pred(3), pred(3), pred(3), pred(3), pred(3), pred(1), pred(1), pred(1), pred(1), pred(1), pred(1)], createdAt: new Date('2026-06-01T12:00:00Z') }),
      ];
      mockPrisma.systemConfig.findFirst.mockResolvedValue({ betAmount: 20 });
      mockPrisma.user.count.mockResolvedValue(2);
      mockPrisma.user.findMany.mockResolvedValue(users);
      jest.spyOn(service as any, 'calculatePrizes').mockResolvedValue({});

      return service.getRanking().then(r => {
        const c = r.find(u => u.id === 'C')!;
        const d = r.find(u => u.id === 'D')!;
        expect(c.score).toBe(d.score);
        expect(c.exactHits).toBe(d.exactHits);
        expect(c.winnerHits).toBeGreaterThan(d.winnerHits);
        expect(c.position).toBeLessThan(d.position);
      });
    });
  });

  describe('getRanking', () => {
    it('deve retornar apenas usuários ativos', async () => {
      mockPrisma.systemConfig.findFirst.mockResolvedValue({ betAmount: 20 });
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      const ranking = await service.getRanking();
      expect(ranking).toHaveLength(0);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });

    it('deve respeitar limite de 50 resultados', async () => {
      mockPrisma.systemConfig.findFirst.mockResolvedValue({ betAmount: 20 });
      mockPrisma.user.count.mockResolvedValue(0);
      const users = Array.from({ length: 60 }, (_, i) => makeUser({
        id: `${i}`, fullName: `User ${i}`, username: `user${i}`,
        predictions: [pred(3)],
      }));
      mockPrisma.user.findMany.mockResolvedValue(users);

      const ranking = await service.getRanking(50);
      expect(ranking).toHaveLength(50);
    });
  });

  describe('calculatePrizes', () => {
    it('deve retornar vazio se prizePool for zero', async () => {
      const result = await (service as any).calculatePrizes(0);
      expect(result).toEqual({});
    });

    it('deve retornar vazio se prizePool for negativo', async () => {
      const result = await (service as any).calculatePrizes(-1);
      expect(result).toEqual({});
    });

    it('deve retornar vazio se nenhum qualifier tiver score > 0', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: '1', predictions: [{ pointsEarned: 0 }, { pointsEarned: 0 }] },
        { id: '2', predictions: [{ pointsEarned: 0 }] },
      ]);
      const result = await (service as any).calculatePrizes(100);
      expect(result).toEqual({});
    });

    it('deve dar 100% para único qualificador — R$1000', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: '1', predictions: [{ pointsEarned: 10 }] },
        { id: '2', predictions: [{ pointsEarned: 0 }] },
      ]);
      const result = await (service as any).calculatePrizes(1000);
      expect(result['1']).toBe(1000);
      expect(Object.keys(result)).toHaveLength(1);
    });

    it('deve dividir 70/30 entre 2 qualificadores', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: '1', predictions: [{ pointsEarned: 10 }] },
        { id: '2', predictions: [{ pointsEarned: 5 }] },
      ]);
      const result = await (service as any).calculatePrizes(1000);
      expect(result['1']).toBe(700);
      expect(result['2']).toBe(300);
      const total = Object.values(result).reduce((s: number, v: any) => s + v, 0);
      expect(total).toBe(1000);
    });

    it('deve dividir 60/25/15 entre 3 qualificadores — R$1000', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: '1', predictions: [{ pointsEarned: 15 }] },
        { id: '2', predictions: [{ pointsEarned: 10 }] },
        { id: '3', predictions: [{ pointsEarned: 5 }] },
      ]);
      const result = await (service as any).calculatePrizes(1000);
      expect(result['1']).toBe(600);
      expect(result['2']).toBe(250);
      expect(result['3']).toBe(150);
      const total = Object.values(result).reduce((s: number, v: any) => s + v, 0);
      expect(total).toBe(1000);
    });

    it('deve distribuir apenas top 3 quando há 4+ qualificadores', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: '1', predictions: [{ pointsEarned: 20 }] },
        { id: '2', predictions: [{ pointsEarned: 15 }] },
        { id: '3', predictions: [{ pointsEarned: 10 }] },
        { id: '4', predictions: [{ pointsEarned: 5 }] },
      ]);
      const result = await (service as any).calculatePrizes(1000);
      expect(Object.keys(result)).toHaveLength(3);
    });
  });

  describe('getUserPosition', () => {
    it('deve retornar entry do usuário no ranking', async () => {
      jest.spyOn(service, 'getRanking').mockResolvedValue([
        { position: 1, id: '1', fullName: 'A', username: 'a', hasPaid: true, score: 10, exactHits: 2, winnerHits: 1, achievements: 0, prize: 10 },
        { position: 2, id: '2', fullName: 'B', username: 'b', hasPaid: false, score: 5, exactHits: 1, winnerHits: 0, achievements: 0, prize: 0 },
      ]);
      const result = await service.getUserPosition('1');
      expect(result).toEqual({
        position: 1, id: '1', fullName: 'A', username: 'a', hasPaid: true, score: 10, exactHits: 2, winnerHits: 1, achievements: 0, prize: 10,
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
      mockPrisma.systemConfig.findFirst.mockResolvedValue({ betAmount: 20 });
      mockPrisma.user.count.mockResolvedValue(10);
      const rules = await service.getPrizeRules();

      expect(rules.paidUsers).toBe(10);
      expect(rules.registrationFee).toBe(20);
      expect(rules.totalCollected).toBe(200);
      expect(rules.prizePool).toBe(200);
      expect(rules.distributionTable).toHaveLength(3);
      expect(rules.distributionTable[0]).toEqual({
        qualifiers: '3 ou mais', first: '60%', second: '25%', third: '15%',
      });
      expect(rules.rules.length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('recordDailySnapshot', () => {
    it('deve criar histórico para cada entry', async () => {
      jest.spyOn(service, 'getRanking').mockResolvedValue([
        { position: 1, id: '1', fullName: 'A', username: 'a', hasPaid: true, score: 10, exactHits: 2, winnerHits: 1, achievements: 0, prize: 10 },
        { position: 2, id: '2', fullName: 'B', username: 'b', hasPaid: false, score: 5, exactHits: 1, winnerHits: 0, achievements: 0, prize: 0 },
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
