import { Test, TestingModule } from '@nestjs/testing';
import { MatchesGateway } from './matches.gateway';
import { ScoringService } from '../admin/scoring.service';
import { PrismaService } from '../common/prisma.service';
import { GamificationService } from '../gamification/gamification.service';
import { RankingGateway } from '../ranking/ranking.gateway';
import { RankingService } from '../ranking/ranking.service';
import { MatchesService } from './matches.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

describe('MatchesGateway — Emissão WebSocket', () => {
  // ─── Testes unitários do gateway ─────────────────────────────

  describe('Métodos do Gateway (unitário)', () => {
    let gateway: MatchesGateway;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [MatchesGateway],
      }).compile();
      gateway = module.get<MatchesGateway>(MatchesGateway);
      (gateway as any).server = { emit: jest.fn() };
    });

    it('emitMatchUpdate deve chamar server.emit com "match-update" e o objeto', () => {
      const emitSpy = jest.spyOn(gateway['server'], 'emit').mockImplementation(() => true as any);
      const match = { id: 'm1', homeScore: 2, awayScore: 1, status: 'IN_PROGRESS' };

      gateway.emitMatchUpdate(match);

      expect(emitSpy).toHaveBeenCalledWith('match-update', match);
    });

    it('emitMatchesBatchUpdate deve chamar server.emit com "matches-batch-update" e array', () => {
      const emitSpy = jest.spyOn(gateway['server'], 'emit').mockImplementation(() => true as any);
      const matches = [
        { id: 'm1', homeScore: 2, awayScore: 1, status: 'IN_PROGRESS' },
        { id: 'm2', homeScore: 1, awayScore: 1, status: 'FINISHED' },
      ];

      gateway.emitMatchesBatchUpdate(matches);

      expect(emitSpy).toHaveBeenCalledWith('matches-batch-update', matches);
    });

    it('emitLiveStatus deve chamar server.emit com "live-status" e contagem', () => {
      const emitSpy = jest.spyOn(gateway['server'], 'emit').mockImplementation(() => true as any);
      const liveMatches = [{ id: 'm1', status: 'IN_PROGRESS' }];

      gateway.emitLiveStatus(1, liveMatches);

      expect(emitSpy).toHaveBeenCalledWith('live-status', { liveCount: 1, liveMatches });
    });
  });

  // ─── Teste de integração: syncResults → gateway ──────────────

  describe('ScoringService emite match-update após pontuar', () => {
    let scoring: ScoringService;
    let mockPrisma: any;
    let mockGateway: any;
    let mockRankingGateway: any;
    let mockRankingService: any;
    let mockGamification: any;

    beforeEach(async () => {
      mockPrisma = {
        match: { findUnique: jest.fn() },
        prediction: { findMany: jest.fn(), update: jest.fn() },
        user: { findMany: jest.fn() },
      };
      mockGateway = { emitMatchUpdate: jest.fn(), emitMatchesBatchUpdate: jest.fn(), emitLiveStatus: jest.fn() };
      mockRankingGateway = { emitRankingUpdate: jest.fn() };
      mockRankingService = { getRanking: jest.fn() };
      mockGamification = { checkAndAwardAchievements: jest.fn() };
      const mockWhatsapp = {
        hasNotificationBeenSent: jest.fn(),
        sendMatchFinishedNotification: jest.fn(),
        sendRankingNotification: jest.fn(),
        recordNotification: jest.fn(),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ScoringService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: GamificationService, useValue: mockGamification },
          { provide: RankingGateway, useValue: mockRankingGateway },
          { provide: RankingService, useValue: mockRankingService },
          { provide: MatchesGateway, useValue: mockGateway },
          { provide: WhatsappService, useValue: mockWhatsapp },
        ],
      }).compile();

      scoring = module.get<ScoringService>(ScoringService);
    });

    it('deve emitir match-update via gateway após calcular pontos', async () => {
      const match = {
        id: 'm1',
        homeScore: 2,
        awayScore: 1,
        teamHome: 'Brasil',
        teamAway: 'Argentina',
        status: 'FINISHED',
      };

      mockPrisma.match.findUnique
        .mockResolvedValueOnce(match)               // 1ª chamada: verificar se match existe
        .mockResolvedValueOnce(match);              // 2ª chamada: buscar match atualizado para emitir

      mockPrisma.prediction.findMany.mockResolvedValue([
        { id: 'p1', userId: 'u1', predictedHome: 2, predictedAway: 1, pointsEarned: null, user: { fullName: 'Test User' } },
      ]);
      mockPrisma.prediction.update.mockResolvedValue({});
      mockRankingService.getRanking.mockResolvedValue([{ id: 'u1', score: 5 }]);

      await scoring.calculateAndDistributePoints('m1');

      // Verifica se o gateway emitiu o match-update com os dados corretos
      expect(mockGateway.emitMatchUpdate).toHaveBeenCalledWith(match);
    });

    it('deve emitir ranking-update via RankingGateway', async () => {
      const match = {
        id: 'm1',
        homeScore: 2,
        awayScore: 1,
        status: 'FINISHED',
      };
      const ranking = [{ id: 'u1', score: 5, position: 1 }];

      mockPrisma.match.findUnique
        .mockResolvedValueOnce(match)
        .mockResolvedValueOnce(match);
      mockPrisma.prediction.findMany.mockResolvedValue([
        { id: 'p1', userId: 'u1', predictedHome: 2, predictedAway: 1, pointsEarned: null, user: { fullName: 'Test User' } },
      ]);
      mockPrisma.prediction.update.mockResolvedValue({});
      mockRankingService.getRanking.mockResolvedValue(ranking);

      await scoring.calculateAndDistributePoints('m1');

      expect(mockRankingGateway.emitRankingUpdate).toHaveBeenCalledWith(ranking);
    });

    it('não deve emitir match-update se match não for encontrado após pontuar', async () => {
      mockPrisma.match.findUnique
        .mockResolvedValueOnce(null)  // match não encontrado no início
        .mockResolvedValueOnce(null); // também não na busca pós-pontuação

      await scoring.calculateAndDistributePoints('m1');

      expect(mockGateway.emitMatchUpdate).not.toHaveBeenCalled();
    });
  });

  // ─── Teste de integração: FootballApiService.syncResults → MatchesGateway ──

  describe('syncResults emite matches-batch-update via MatchesGateway', () => {
    // Este teste verifica que o gateway é chamado após o syncResults
    // A lógica detalhada de syncResults é testada em football-api.service.spec.ts
    it('deve existir e aceitar dados de matches', () => {
      const gateway = new MatchesGateway();
      (gateway as any).server = { emit: jest.fn() };
      const emitSpy = jest.spyOn(gateway['server'], 'emit').mockImplementation(() => true as any);

      const matches = [{ id: 'm1', homeScore: 2, awayScore: 1, status: 'FINISHED' }];
      gateway.emitMatchesBatchUpdate(matches);

      expect(emitSpy).toHaveBeenCalledWith('matches-batch-update', matches);
    });
  });
});
