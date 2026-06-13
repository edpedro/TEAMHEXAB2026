import { Test, TestingModule } from '@nestjs/testing';
import { RankingService } from './ranking/ranking.service';
import { PrismaService } from './common/prisma.service';

describe('Critérios de Desempate do Ranking', () => {
  let service: RankingService;

  const mockPrisma = {
    systemConfig: { findFirst: jest.fn() },
    user: { findMany: jest.fn(), count: jest.fn() },
    rankingHistory: { create: jest.fn(), findMany: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RankingService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<RankingService>(RankingService);
  });

  afterEach(() => { jest.clearAllMocks(); });

  function rawPred(points: number, createdAt?: string) {
    return { pointsEarned: points, createdAt: createdAt ? new Date(createdAt) : new Date('2026-06-01T12:00:00Z') };
  }

  function rawUser(overrides: any = {}) {
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

  function mapUser(raw: any) {
    const totalScore = raw.predictions.reduce((sum: number, p: any) => sum + (p.pointsEarned || 0), 0);
    const exactHits = raw.predictions.filter((p: any) => p.pointsEarned === 5).length;
    const winnerHits = raw.predictions.filter((p: any) => (p.pointsEarned || 0) >= 3 && p.pointsEarned !== 5).length;
    const totalPredictions = raw.predictions.length;
    const predictionDates = raw.predictions.map((p: any) => p.createdAt.getTime());
    return {
      id: raw.id,
      fullName: raw.fullName,
      username: raw.username,
      hasPaid: raw.hasPaid,
      paidAt: raw.paidAt,
      createdAt: raw.createdAt,
      predictionDates,
      score: totalScore,
      exactHits,
      winnerHits,
      totalPredictions,
      achievements: raw._count.userAchievements,
    };
  }

  function sort(rawUsers: any[]) {
    const mapped = rawUsers.map(mapUser);
    return (service as any).sortWithTiebreakers(mapped);
  }

  describe('1º critério: Maior pontuação total', () => {
    it('deve colocar usuário com maior pontuação em primeiro', () => {
      const users = [
        rawUser({ id: '1', predictions: [rawPred(5), rawPred(3)] }),
        rawUser({ id: '2', predictions: [rawPred(5), rawPred(5), rawPred(3)] }),
      ];
      const result = sort(users);
      expect(result[0].id).toBe('2');
      expect(result[0].score).toBe(13);
      expect(result[1].id).toBe('1');
      expect(result[1].score).toBe(8);
    });

    it('deve ordenar 3 usuários por pontuação decrescente', () => {
      const users = [
        rawUser({ id: '1', predictions: [rawPred(3)] }),
        rawUser({ id: '2', predictions: [rawPred(5), rawPred(5)] }),
        rawUser({ id: '3', predictions: [rawPred(5), rawPred(3), rawPred(1)] }),
      ];
      const result = sort(users);
      expect(result[0].id).toBe('2');
      expect(result[1].id).toBe('3');
      expect(result[2].id).toBe('1');
    });
  });

  describe('2º critério: Maior quantidade de placares exatos', () => {
    it('mesma pontuação: maior nº de placares exatos vence', () => {
      const users = [
        rawUser({ id: '2', predictions: [rawPred(5), rawPred(3), rawPred(0)] }),
        rawUser({ id: '1', predictions: [rawPred(5), rawPred(5), rawPred(0)] }),
      ];
      const result = sort(users);
      expect(result[0].id).toBe('1');
      expect(result[0].score).toBe(10);
      expect(result[0].exactHits).toBe(2);
      expect(result[1].id).toBe('2');
      expect(result[1].score).toBe(8);
      expect(result[1].exactHits).toBe(1);
    });

    it('deve desempatar 3 usuários por exactHits após pontuação', () => {
      const users = [
        rawUser({ id: '1', fullName: 'User A', predictions: [rawPred(5), rawPred(3), rawPred(0)] }),
        rawUser({ id: '2', fullName: 'User B', predictions: [rawPred(5), rawPred(5), rawPred(3)] }),
        rawUser({ id: '3', fullName: 'User C', predictions: [rawPred(5), rawPred(5), rawPred(0)] }),
      ];
      const result = sort(users);
      expect(result[0].id).toBe('2'); // 13pts, 2 exact
      expect(result[1].id).toBe('3'); // 10pts, 2 exact
      expect(result[2].id).toBe('1'); // 8pts, 1 exact
    });
  });

  describe('3º critério: Maior quantidade de acertos de vencedor', () => {
    it('mesma pontuação e exactHits: maior winnerHits vence', () => {
      const users = [
        rawUser({ id: 'C', fullName: 'User C', predictions: [rawPred(5), rawPred(5), rawPred(3), rawPred(3), rawPred(3), rawPred(3), rawPred(3), rawPred(3), rawPred(3), rawPred(3)] }),
        rawUser({ id: 'D', fullName: 'User D', predictions: [rawPred(5), rawPred(5), rawPred(3), rawPred(3), rawPred(3), rawPred(3), rawPred(3), rawPred(3), rawPred(1), rawPred(1), rawPred(1), rawPred(1), rawPred(1), rawPred(1)] }),
      ];
      const result = sort(users);
      expect(result[0].id).toBe('C');
      expect(result[1].id).toBe('D');
      expect(result[0].winnerHits).toBe(8);
      expect(result[1].winnerHits).toBe(6);
    });
  });

  describe('4º critério: Maior quantidade total de palpites realizados', () => {
    it('mesma pontuação, exactHits e winnerHits: mais palpites vence', () => {
      const users = [
        rawUser({ id: 'X', predictions: [rawPred(5), rawPred(5), rawPred(5), rawPred(3), rawPred(3), rawPred(3), rawPred(3)] }),
        rawUser({ id: 'Y', predictions: [rawPred(5), rawPred(5), rawPred(5), rawPred(3), rawPred(3), rawPred(3), rawPred(3), rawPred(0), rawPred(0)] }),
      ];
      const result = sort(users);
      expect(result[0].id).toBe('Y');
      expect(result[1].id).toBe('X');
      expect(result[0].totalPredictions).toBe(9);
      expect(result[1].totalPredictions).toBe(7);
    });

    it('empatados em score/exact/winner/totalPredictions: próximo critério decide', () => {
      const users = [
        rawUser({ id: 'A', predictions: [rawPred(3, '2026-06-05T12:00:00Z')], createdAt: new Date('2026-06-01T12:00:00Z') }),
        rawUser({ id: 'B', predictions: [rawPred(3, '2026-06-03T12:00:00Z')], createdAt: new Date('2026-06-01T12:00:00Z') }),
      ];
      const result = sort(users);
      expect(result[0].id).toBe('B');
      expect(result[1].id).toBe('A');
    });
  });

  describe('5º critério: Total de palpites mais antigo (comparação sequencial)', () => {
    it('primeiro palpite mais antigo vence o desempate', () => {
      const users = [
        rawUser({ id: '2', predictions: [rawPred(5, '2026-06-05T12:00:00Z')], paidAt: null, createdAt: new Date('2026-06-01T12:00:00Z') }),
        rawUser({ id: '1', predictions: [rawPred(5, '2026-06-03T12:00:00Z')], paidAt: null, createdAt: new Date('2026-06-01T12:00:00Z') }),
      ];
      const result = sort(users);
      expect(result[0].id).toBe('1');
      expect(result[1].id).toBe('2');
    });

    it('compara sequencialmente todos os palpites quando o primeiro empata', () => {
      const users = [
        rawUser({ id: 'B', predictions: [
          rawPred(5, '2026-01-05T09:00:00Z'),
          rawPred(5, '2026-01-07T11:00:00Z'),
          rawPred(5, '2026-01-07T16:00:00Z'),
        ], paidAt: null, createdAt: new Date('2026-06-01T12:00:00Z') }),
        rawUser({ id: 'A', predictions: [
          rawPred(5, '2026-01-05T09:00:00Z'),
          rawPred(5, '2026-01-06T11:00:00Z'),
          rawPred(5, '2026-01-07T16:00:00Z'),
        ], paidAt: null, createdAt: new Date('2026-06-01T12:00:00Z') }),
      ];
      const result = sort(users);
      expect(result[0].id).toBe('A'); // mesmo 1º palpite, A tem 2º palpite mais antigo
      expect(result[1].id).toBe('B');
    });

    it('se 1º palpite empata e 2º palpite empata, decide pelo 3º', () => {
      const users = [
        rawUser({ id: 'B', predictions: [
          rawPred(5, '2026-01-05T09:00:00Z'),
          rawPred(5, '2026-01-06T11:00:00Z'),
          rawPred(5, '2026-01-10T16:00:00Z'),
        ], paidAt: null, createdAt: new Date('2026-06-01T12:00:00Z') }),
        rawUser({ id: 'A', predictions: [
          rawPred(5, '2026-01-05T09:00:00Z'),
          rawPred(5, '2026-01-06T11:00:00Z'),
          rawPred(5, '2026-01-07T16:00:00Z'),
        ], paidAt: null, createdAt: new Date('2026-06-01T12:00:00Z') }),
      ];
      const result = sort(users);
      expect(result[0].id).toBe('A'); // 1º e 2º empatam, A tem 3º mais antigo
      expect(result[1].id).toBe('B');
    });

    it('usuário sem predictions perde (Infinity vs data real na 1ª posição)', () => {
      const users = [
        rawUser({ id: 'A', predictions: [rawPred(0, '2026-06-05T12:00:00Z')], paidAt: null, createdAt: new Date('2026-06-01T12:00:00Z') }),
        rawUser({ id: 'B', predictions: [], paidAt: null, createdAt: new Date('2026-06-01T12:00:00Z') }),
      ];
      const result = sort(users);
      expect(result[0].id).toBe('A');
      expect(result[1].id).toBe('B');
    });
  });

  describe('6º critério: Data de pagamento mais antiga', () => {
    it('paidAt mais antigo vence o desempate', () => {
      const users = [
        rawUser({ id: '2', predictions: [rawPred(5)], paidAt: new Date('2026-06-05T12:00:00Z'), createdAt: new Date('2026-06-01T12:00:00Z') }),
        rawUser({ id: '1', predictions: [rawPred(5)], paidAt: new Date('2026-06-03T12:00:00Z'), createdAt: new Date('2026-06-01T12:00:00Z') }),
      ];
      const result = sort(users);
      expect(result[0].id).toBe('1');
      expect(result[1].id).toBe('2');
    });

    it('quem pagou vence sobre quem não pagou (paidAt null fica por último)', () => {
      const users = [
        rawUser({ id: 'B', predictions: [rawPred(5)], paidAt: null, createdAt: new Date('2026-06-01T12:00:00Z') }),
        rawUser({ id: 'A', predictions: [rawPred(5)], paidAt: new Date('2026-06-10T12:00:00Z'), createdAt: new Date('2026-06-01T12:00:00Z') }),
      ];
      const result = sort(users);
      expect(result[0].id).toBe('A');
      expect(result[1].id).toBe('B');
    });
  });

  describe('7º critério: Data de cadastro mais antiga', () => {
    it('createdAt mais antigo vence o desempate final', () => {
      const users = [
        rawUser({ id: '2', predictions: [rawPred(5)], paidAt: null, createdAt: new Date('2026-06-05T12:00:00Z') }),
        rawUser({ id: '1', predictions: [rawPred(5)], paidAt: null, createdAt: new Date('2026-06-03T12:00:00Z') }),
      ];
      const result = sort(users);
      expect(result[0].id).toBe('1');
      expect(result[1].id).toBe('2');
    });
  });

  describe('Cenários combinados (múltiplos critérios em sequência)', () => {
    it('100pts/20exact sobe acima de 100pts/8exact', () => {
      const users = [
        rawUser({ id: 'A', fullName: 'User A', predictions: Array(20).fill(null).map(() => rawPred(5)), createdAt: new Date('2026-06-01T12:00:00Z') }),
        rawUser({ id: 'B', fullName: 'User B', predictions: [...Array(8).fill(null).map(() => rawPred(5)), ...Array(20).fill(null).map(() => rawPred(3))], createdAt: new Date('2026-06-01T12:00:00Z') }),
      ];
      const result = sort(users);
      const a = result.find((u: any) => u.id === 'A')!;
      const b = result.find((u: any) => u.id === 'B')!;
      expect(a.score).toBe(100);
      expect(b.score).toBe(100);
      expect(a.exactHits).toBe(20);
      expect(b.exactHits).toBe(8);
      expect(result.indexOf(a)).toBeLessThan(result.indexOf(b));
    });

    it('todos os 7 critérios em ordem — cenário completo', () => {
      const baseDate = new Date('2026-06-01T12:00:00Z');
      const users = [
        rawUser({
          id: '1',
          predictions: [rawPred(5), rawPred(3)],
          paidAt: new Date('2026-06-10T12:00:00Z'),
          createdAt: baseDate,
        }),
        rawUser({
          id: '2',
          predictions: [rawPred(5), rawPred(5), rawPred(3)],
          paidAt: new Date('2026-06-10T12:00:00Z'),
          createdAt: baseDate,
        }),
      ];
      const result = sort(users);
      expect(result[0].id).toBe('2');
      expect(result[1].id).toBe('1');
    });

    it('score, exact e winner iguais — decide totalPredictions', () => {
      const users = [
        rawUser({ id: 'P', predictions: [rawPred(5), rawPred(3)], createdAt: new Date('2026-06-01T12:00:00Z') }),
        rawUser({ id: 'Q', predictions: [rawPred(5), rawPred(3), rawPred(0)], createdAt: new Date('2026-06-01T12:00:00Z') }),
      ];
      const result = sort(users);
      expect(result[0].id).toBe('Q');
      expect(result[0].totalPredictions).toBe(3);
      expect(result[1].id).toBe('P');
      expect(result[1].totalPredictions).toBe(2);
    });

    it('score, exact, winner, totalPredictions iguais — decide total de palpites mais antigo', () => {
      const users = [
        rawUser({ id: 'A', predictions: [rawPred(5, '2026-06-10T12:00:00Z'), rawPred(3, '2026-06-11T12:00:00Z')], createdAt: new Date('2026-06-01T12:00:00Z') }),
        rawUser({ id: 'B', predictions: [rawPred(5, '2026-06-03T12:00:00Z'), rawPred(3, '2026-06-04T12:00:00Z')], createdAt: new Date('2026-06-01T12:00:00Z') }),
      ];
      const result = sort(users);
      expect(result[0].id).toBe('B');
      expect(result[1].id).toBe('A');
    });

    it('5 critérios empatados — decide paidAt', () => {
      const users = [
        rawUser({ id: 'X', predictions: [rawPred(5, '2026-06-01T12:00:00Z')], paidAt: new Date('2026-06-05T12:00:00Z'), createdAt: new Date('2026-06-01T12:00:00Z') }),
        rawUser({ id: 'Y', predictions: [rawPred(5, '2026-06-01T12:00:00Z')], paidAt: new Date('2026-06-03T12:00:00Z'), createdAt: new Date('2026-06-01T12:00:00Z') }),
      ];
      const result = sort(users);
      expect(result[0].id).toBe('Y');
      expect(result[1].id).toBe('X');
    });

    it('6 critérios empatados — decide createdAt (mais antigo vence)', () => {
      const users = [
        rawUser({ id: 'M', predictions: [rawPred(5, '2026-06-01T12:00:00Z')], paidAt: new Date('2026-06-01T12:00:00Z'), createdAt: new Date('2026-06-02T12:00:00Z') }),
        rawUser({ id: 'N', predictions: [rawPred(5, '2026-06-01T12:00:00Z')], paidAt: new Date('2026-06-01T12:00:00Z'), createdAt: new Date('2026-06-01T12:00:00Z') }),
      ];
      const result = sort(users);
      expect(result[0].id).toBe('N');
      expect(result[1].id).toBe('M');
    });
  });

  describe('Estabilidade com dados vazios', () => {
    it('deve lidar com array vazio', () => {
      const result = sort([]);
      expect(result).toEqual([]);
    });

    it('deve lidar com usuário sem predictions', () => {
      const users = [
        rawUser({ id: 'A', predictions: [] }),
        rawUser({ id: 'B', predictions: [] }),
      ];
      const result = sort(users);
      expect(result).toHaveLength(2);
    });

    it('deve lidar com usuário com predictions mas todas zeradas', () => {
      const users = [
        rawUser({ id: 'A', predictions: [rawPred(0), rawPred(0)] }),
        rawUser({ id: 'B', predictions: [rawPred(0)] }),
      ];
      const result = sort(users);
      expect(result).toHaveLength(2);
    });
  });
});
