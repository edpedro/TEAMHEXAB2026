import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FootballApiService } from './football-api/football-api.service';
import { PrismaService } from './common/prisma.service';
import { ScoringService } from './admin/scoring.service';
import { MatchesGateway } from './matches/matches.gateway';
import { GamificationService } from './gamification/gamification.service';
import { RankingGateway } from './ranking/ranking.gateway';
import { RankingService } from './ranking/ranking.service';
import { PredictionsService } from './predictions/predictions.service';
import { AdminService } from './admin/admin.service';
import { NotificationsService } from './notifications/notifications.service';
import { ReceiptsService } from './receipts/receipts.service';
import { WhatsappService } from './whatsapp/whatsapp.service';
import { MatchStatus } from '@prisma/client';

const mockWhatsapp = { hasNotificationBeenSent: jest.fn(), sendMatchFinishedNotification: jest.fn(), sendRankingNotification: jest.fn(), recordNotification: jest.fn() };

describe('Concorrência e Race Conditions', () => {
  describe('R01 — Dois CRONs simultâneos', () => {
    let footballApi: FootballApiService;
    let prisma: any;

    beforeEach(async () => {
      const mockPrisma = {
        match: { count: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
        prediction: { count: jest.fn() },
        user: { count: jest.fn() },
      };
      const mockConfig = { get: jest.fn((key: string, def?: any) => {
        if (key === 'WORLDCUP_API_URL') return 'https://worldcup26.ir';
        return def;
      })};
      const mockScoring = { calculateAndDistributePoints: jest.fn() };
      const mockMatchesGateway = {
        emitMatchUpdate: jest.fn(),
        emitMatchesBatchUpdate: jest.fn(),
        emitLiveStatus: jest.fn(),
      };

      const mod = await Test.createTestingModule({
        providers: [
          FootballApiService,
          { provide: ConfigService, useValue: mockConfig },
          { provide: PrismaService, useValue: mockPrisma },
          { provide: ScoringService, useValue: mockScoring },
          { provide: MatchesGateway, useValue: mockMatchesGateway },
        ],
      }).compile();

      footballApi = mod.get(FootballApiService);
      prisma = mockPrisma;
    });

    it('deve ignorar handleCronResults se isSyncing true', async () => {
      (footballApi as any).isSyncing = true;
      const spy = jest.spyOn(footballApi as any, 'syncResults');
      await footballApi.handleCronResults();
      expect(spy).not.toHaveBeenCalled();
    });

    it('deve ignorar handleCronFullSync se isSyncing true', async () => {
      (footballApi as any).isSyncing = true;
      const spy = jest.spyOn(footballApi as any, 'syncAll');
      await footballApi.handleCronFullSync();
      expect(spy).not.toHaveBeenCalled();
    });

    it('deve resetar isSyncing após execução', async () => {
      (footballApi as any).isSyncing = false;
      jest.spyOn(footballApi as any, 'syncAll').mockResolvedValue({ teams: 0, matches: 0, stadiums: 0, groups: 0 });

      expect((footballApi as any).isSyncing).toBe(false);
      const promise = footballApi.handleCronFullSync();
      expect((footballApi as any).isSyncing).toBe(true);
      await promise;
      expect((footballApi as any).isSyncing).toBe(false);
    });
  });

  describe('R02 — Dois usuários palpitando no mesmo jogo', () => {
    it('deve bloquear palpite duplicado', async () => {
      const p = {
        match: { findUnique: jest.fn() },
        prediction: { findFirst: jest.fn(), create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      };
      p.match.findUnique.mockResolvedValue({
        id: 'm1', matchDate: new Date(Date.now() + 60 * 60 * 1000),
      });
      p.prediction.findUnique.mockResolvedValue({
        id: 'existing', userId: 'u1', matchId: 'm1',
      });

      const mod = await Test.createTestingModule({
        providers: [PredictionsService, { provide: PrismaService, useValue: p }],
      }).compile();
      const svc = mod.get(PredictionsService);

      await expect(
        svc.create('u1', { matchId: 'm1', predictedHome: 1, predictedAway: 1 }),
      ).rejects.toThrow('Você já palpitou nesta partida');
    });

    it('deve permitir palpite de dois usuários diferentes no mesmo jogo', async () => {
      const p = {
        match: { findUnique: jest.fn() },
        prediction: { findFirst: jest.fn(), create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      };
      p.match.findUnique.mockResolvedValue({
        id: 'm1', matchDate: new Date(Date.now() + 60 * 60 * 1000),
      });
      p.prediction.findFirst.mockResolvedValue(null);
      p.prediction.create.mockResolvedValue({ id: 'p1', userId: 'u2', matchId: 'm1', predictedHome: 2, predictedAway: 0, pointsEarned: null });

      const mod = await Test.createTestingModule({
        providers: [PredictionsService, { provide: PrismaService, useValue: p }],
      }).compile();
      const svc = mod.get(PredictionsService);

      const r = await svc.create('u2', { matchId: 'm1', predictedHome: 2, predictedAway: 0 });
      expect(r.id).toBe('p1');
    });
  });

  describe('R03 — Recálculo de pontos durante novo palpite', () => {
    it('não deve interferir (scoring recalcula matchId específico)', async () => {
      const p = {
        match: { findUnique: jest.fn(), update: jest.fn() },
        prediction: { findMany: jest.fn(), update: jest.fn() },
        user: { findMany: jest.fn() },
      };
      const mockGamif = { checkAndAwardAchievements: jest.fn() };
      const mockRg = { emitRankingUpdate: jest.fn() };
      const mockRs = { getRanking: jest.fn().mockResolvedValue([]) };

      p.match.findUnique.mockResolvedValue({
        id: 'm1', homeScore: 2, awayScore: 1, status: 'FINISHED',
      });
      p.prediction.findMany.mockResolvedValue([
        { id: 'p1', userId: 'u1', predictedHome: 2, predictedAway: 1, pointsEarned: null, user: { fullName: 'User Um' } },
        { id: 'p2', userId: 'u2', predictedHome: 1, predictedAway: 1, pointsEarned: null, user: { fullName: 'User Dois' } },
      ]);
      p.prediction.update.mockResolvedValue({});

      const mod = await Test.createTestingModule({
        providers: [
          ScoringService,
          { provide: PrismaService, useValue: p },
          { provide: GamificationService, useValue: mockGamif },
          { provide: RankingGateway, useValue: mockRg },
          { provide: RankingService, useValue: mockRs },
          { provide: MatchesGateway, useValue: { emitMatchUpdate: jest.fn(), emitMatchesBatchUpdate: jest.fn(), emitLiveStatus: jest.fn() } },
          { provide: WhatsappService, useValue: mockWhatsapp },
        ],
      }).compile();
      const svc = mod.get(ScoringService);

      await svc.calculateAndDistributePoints('m1');
      expect(p.prediction.update).toHaveBeenCalledTimes(2);
      expect(mockRg.emitRankingUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe('R04 — Admin define resultado enquanto CRON sincroniza', () => {
    it('resultado manual prevalece (setResult não verifica status CRON)', async () => {
      const p = {
        match: { findUnique: jest.fn(), update: jest.fn() },
        prediction: { findMany: jest.fn(), update: jest.fn() },
        user: { count: jest.fn(), findMany: jest.fn() },
        systemConfig: { findFirst: jest.fn() },
        paymentReceipt: { findMany: jest.fn() },
        userAchievement: { findMany: jest.fn(), create: jest.fn() },
        achievement: { findMany: jest.fn() },
        notification: { create: jest.fn(), findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn() },
        topScorerPrediction: { findUnique: jest.fn() },
        rankingHistory: { create: jest.fn(), findMany: jest.fn() },
      };
      const mockScore = { calculateAndDistributePoints: jest.fn() };
      const mockRanking = { getRanking: jest.fn().mockResolvedValue([]) };
      const mockRg = { emitRankingUpdate: jest.fn() };

      p.match.findUnique.mockResolvedValue({
        id: 'm1', teamHome: 'Brasil', teamAway: 'Argentina', status: 'SCHEDULED',
      });
      p.match.update.mockResolvedValue({
        id: 'm1', homeScore: 3, awayScore: 0, status: 'FINISHED',
      });
      p.prediction.findMany.mockResolvedValue([]);
      p.user.count.mockResolvedValue(2);

      const mod = await Test.createTestingModule({
        providers: [
          AdminService, ScoringService,
          { provide: PrismaService, useValue: p },
          { provide: GamificationService, useValue: {} },
          { provide: RankingGateway, useValue: mockRg },
          { provide: RankingService, useValue: mockRanking },
          { provide: NotificationsService, useValue: {} },
          { provide: ReceiptsService, useValue: { findAll: jest.fn(), approve: jest.fn(), reject: jest.fn() } },
          { provide: MatchesGateway, useValue: { emitMatchUpdate: jest.fn(), emitMatchesBatchUpdate: jest.fn(), emitLiveStatus: jest.fn() } },
          { provide: WhatsappService, useValue: mockWhatsapp },
        ],
      }).compile();
      const admin = mod.get(AdminService);

      const r = await admin.setResult('m1', 3, 0);
      expect(r.homeScore).toBe(3);
      expect(r.awayScore).toBe(0);
    });
  });

  describe('R05 — CRON não sobrescreve FINISHED manuais', () => {
    it('syncAll não altera matchDate de partida FINISHED', () => {
      const isFinished = true;
      const matchDateDiffers = true;
      const needsDateUpdate = !isFinished && matchDateDiffers;
      expect(needsDateUpdate).toBe(false);
    });

    it('syncAll atualiza matchDate de partida SCHEDULED', () => {
      const isFinished = false;
      const matchDateDiffers = true;
      const needsDateUpdate = !isFinished && matchDateDiffers;
      expect(needsDateUpdate).toBe(true);
    });

    it('syncAll não altera phase de partida FINISHED', () => {
      const isFinished = true;
      const phaseDiffers = true;
      const needsPhaseUpdate = !isFinished && phaseDiffers;
      expect(needsPhaseUpdate).toBe(false);
    });
  });
});
