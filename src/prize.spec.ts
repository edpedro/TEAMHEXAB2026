import { Test, TestingModule } from '@nestjs/testing';
import { RankingService } from './ranking/ranking.service';
import { PrismaService } from './common/prisma.service';

describe('Cálculo de Premiação', () => {
  let rankingService: RankingService;
  let prisma: any;

  function buildUser(id: string, score: number, opts?: { paidAt?: Date; createdAt?: Date; firstAt?: Date }) {
    return {
      id,
      fullName: `User ${id}`,
      username: `user${id}`,
      hasPaid: true,
      paidAt: opts?.paidAt ?? new Date(1000),
      createdAt: opts?.createdAt ?? new Date(500),
      _count: { userAchievements: 0 },
      predictions: [
        { pointsEarned: score, createdAt: opts?.firstAt ?? new Date(2000) },
      ],
    };
  }

  const mkPrisma = () => ({
    user: { findMany: jest.fn(), count: jest.fn() },
    systemConfig: { findFirst: jest.fn() },
    rankingHistory: { create: jest.fn(), findMany: jest.fn() },
  });

  const config = { id: 'cfg-1', betAmount: 20, pixKey: null, knockoutEnabled: false, bettingEnabled: true, betDeadline: null };

  beforeEach(async () => {
    prisma = mkPrisma();
    prisma.systemConfig.findFirst.mockResolvedValue(config);
    prisma.user.count.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RankingService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    rankingService = module.get<RankingService>(RankingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('PR01 — R$ 1.000, 1 ganhador', () => {
    it('deve dar 100% para o único qualificador', async () => {
      prisma.user.findMany.mockResolvedValue([buildUser('u1', 10)]);

      const ranking = await rankingService.getRanking();
      const prizes = (rankingService as any).calculatePrizes;

      const result = await prizes.call(rankingService, 1000);
      expect(result).toEqual({ u1: 1000 });
    });
  });

  describe('PR02 — R$ 1.000, 2 ganhadores', () => {
    it('deve dividir 70/30', async () => {
      prisma.user.findMany.mockResolvedValue([
        buildUser('u1', 10),
        buildUser('u2', 5),
      ]);

      const prizes = (rankingService as any).calculatePrizes;
      const result = await prizes.call(rankingService, 1000);

      expect(result).toEqual({ u1: 700, u2: 300 });
      const sum = Object.values(result).reduce((a: number, b: number) => a + b, 0);
      expect(sum).toBe(1000);
    });
  });

  describe('PR03 — R$ 1.000, 3 ganhadores', () => {
    it('deve dividir 60/25/15', async () => {
      prisma.user.findMany.mockResolvedValue([
        buildUser('u1', 15),
        buildUser('u2', 10),
        buildUser('u3', 5),
      ]);

      const prizes = (rankingService as any).calculatePrizes;
      const result = await prizes.call(rankingService, 1000);

      expect(result).toEqual({ u1: 600, u2: 250, u3: 150 });
      const sum = Object.values(result).reduce((a: number, b: number) => a + b, 0);
      expect(sum).toBe(1000);
    });
  });

  describe('PR04 — R$ 1.500, 3 ganhadores', () => {
    it('deve dividir proporcionalmente 60/25/15', async () => {
      prisma.user.findMany.mockResolvedValue([
        buildUser('u1', 20),
        buildUser('u2', 12),
        buildUser('u3', 8),
      ]);

      const prizes = (rankingService as any).calculatePrizes;
      const result = await prizes.call(rankingService, 1500);

      expect(result).toEqual({ u1: 900, u2: 375, u3: 225 });
      const sum = Object.values(result).reduce((a: number, b: number) => a + b, 0);
      expect(sum).toBe(1500);
    });
  });

  describe('PR05 — R$ 0', () => {
    it('deve retornar objeto vazio', async () => {
      const prizes = (rankingService as any).calculatePrizes;
      const result = await prizes.call(rankingService, 0);
      expect(result).toEqual({});
    });
  });

  describe('PR06 — Valor negativo', () => {
    it('deve retornar objeto vazio', async () => {
      const prizes = (rankingService as any).calculatePrizes;
      const result = await prizes.call(rankingService, -100);
      expect(result).toEqual({});
    });
  });

  describe('PR07 — 0 ganhadores', () => {
    it('deve retornar objeto vazio (ninguém com score > 0)', async () => {
      prisma.user.findMany.mockResolvedValue([
        buildUser('u1', 0),
        buildUser('u2', 0),
      ]);

      const prizes = (rankingService as any).calculatePrizes;
      const result = await prizes.call(rankingService, 1000);
      expect(result).toEqual({});
    });
  });

  describe('PR08 — Soma dos % sempre = 100', () => {
    it('3 ganhadores: 60+25+15 = 100%', async () => {
      prisma.user.findMany.mockResolvedValue([
        buildUser('u1', 30), buildUser('u2', 20), buildUser('u3', 10),
      ]);

      const prizes = (rankingService as any).calculatePrizes;
      const result = await prizes.call(rankingService, 1000);
      const sum = Object.values(result).reduce((a: number, b: number) => a + b, 0);
      expect(sum).toBe(1000);
    });

    it('2 ganhadores: 70+30 = 100%', async () => {
      prisma.user.findMany.mockResolvedValue([
        buildUser('u1', 15), buildUser('u2', 8),
      ]);

      const prizes = (rankingService as any).calculatePrizes;
      const result = await prizes.call(rankingService, 500);
      const sum = Object.values(result).reduce((a: number, b: number) => a + b, 0);
      expect(sum).toBe(500);
    });
  });
});
