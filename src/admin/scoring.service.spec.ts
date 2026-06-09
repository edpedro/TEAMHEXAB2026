import { Test, TestingModule } from '@nestjs/testing';
import { ScoringService } from './scoring.service';
import { PrismaService } from '../common/prisma.service';
import { GamificationService } from '../gamification/gamification.service';
import { RankingGateway } from '../ranking/ranking.gateway';
import { RankingService } from '../ranking/ranking.service';

describe('ScoringService', () => {
  let service: ScoringService;

  const mockPrisma = {
    match: { findUnique: jest.fn() },
    prediction: { findMany: jest.fn(), update: jest.fn() },
    user: { findMany: jest.fn() },
  };

  const mockGamification = { checkAndAwardAchievements: jest.fn() };
  const mockRankingGateway = { emitRankingUpdate: jest.fn() };
  const mockRankingService = { getRanking: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScoringService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GamificationService, useValue: mockGamification },
        { provide: RankingGateway, useValue: mockRankingGateway },
        { provide: RankingService, useValue: mockRankingService },
      ],
    }).compile();

    service = module.get<ScoringService>(ScoringService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('calculatePoints', () => {
    it('deve retornar 5 pontos para placar exato (vitória)', () => {
      const result = (service as any).calculatePoints(2, 1, 2, 1);
      expect(result).toBe(5);
    });

    it('deve retornar 5 pontos para placar exato (empate)', () => {
      const result = (service as any).calculatePoints(1, 1, 1, 1);
      expect(result).toBe(5);
    });

    it('deve retornar 5 pontos para 0-0 exato', () => {
      const result = (service as any).calculatePoints(0, 0, 0, 0);
      expect(result).toBe(5);
    });

    it('deve retornar 3 pontos para mesmo vencedor (mandante)', () => {
      const result = (service as any).calculatePoints(2, 1, 1, 0);
      expect(result).toBe(3);
    });

    it('deve retornar 3 pontos para mesmo vencedor (visitante)', () => {
      const result = (service as any).calculatePoints(0, 2, 1, 3);
      expect(result).toBe(3);
    });

    it('deve retornar 3 pontos para goleada com vencedor correto', () => {
      const result = (service as any).calculatePoints(5, 0, 2, 1);
      expect(result).toBe(3);
    });

    it('deve retornar 0 para vencedor errado', () => {
      const result = (service as any).calculatePoints(2, 1, 0, 2);
      expect(result).toBe(0);
    });

    it('deve retornar 0 quando palpite é empate mas jogo tem vencedor', () => {
      const result = (service as any).calculatePoints(2, 0, 1, 1);
      expect(result).toBe(0);
    });

    it('deve retornar 0 quando jogo é empate mas palpite tem vencedor', () => {
      const result = (service as any).calculatePoints(1, 1, 2, 0);
      expect(result).toBe(0);
    });

    it('deve retornar 1 ponto para empate com placar diferente', () => {
      const result = (service as any).calculatePoints(1, 1, 0, 0);
      expect(result).toBe(1);
    });

    it('deve retornar 1 ponto para empate 2-2 com palpite 0-0', () => {
      const result = (service as any).calculatePoints(2, 2, 0, 0);
      expect(result).toBe(1);
    });

    it('deve retornar 0 quando jogo e palpite tem vencedores opostos', () => {
      const result = (service as any).calculatePoints(1, 0, 0, 1);
      expect(result).toBe(0);
    });

    it('deve retornar 0 para empate 0-0 com palpite de vitória', () => {
      const result = (service as any).calculatePoints(0, 0, 1, 0);
      expect(result).toBe(0);
    });

    it('deve retornar 0 para palpite 0-0 com jogo tendo vencedor', () => {
      const result = (service as any).calculatePoints(2, 1, 0, 0);
      expect(result).toBe(0);
    });
  });
});
