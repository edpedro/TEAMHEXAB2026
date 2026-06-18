import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth/auth.service';
import { PrismaService } from './common/prisma.service';
import { PredictionsService } from './predictions/predictions.service';
import { AdminService } from './admin/admin.service';
import { ScoringService } from './admin/scoring.service';
import { RankingService } from './ranking/ranking.service';
import { ReceiptsService } from './receipts/receipts.service';
import { GamificationService } from './gamification/gamification.service';
import { NotificationsService } from './notifications/notifications.service';
import { RankingGateway } from './ranking/ranking.gateway';
import { MatchesGateway } from './matches/matches.gateway';

describe('Fluxo Completo E2E — Bolão Copa 2026', () => {
  beforeAll(() => {
    jest.spyOn(bcrypt, 'hash').mockImplementation(() => Promise.resolve('$2a$10$hash'));
    jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(true as never));
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  const mkPrisma = () => ({
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn(), findMany: jest.fn() },
    match: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
    prediction: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
    paymentReceipt: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    systemConfig: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    userAchievement: { findMany: jest.fn(), create: jest.fn() },
    achievement: { findMany: jest.fn() },
    rankingHistory: { create: jest.fn(), findMany: jest.fn() },
    notification: { create: jest.fn(), findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn() },
    topScorerPrediction: { findUnique: jest.fn() },
  });

  const baseUser = {
    id: 'user-1', fullName: 'João Silva', username: 'joao',
    passwordHash: '$2a$10$hash', role: 'USER', isActive: true,
    isTempPassword: false, hasPaid: false, paidAt: null, createdAt: new Date(),
  };

  const baseMatch = {
    id: 'match-1', teamHome: 'Brasil', teamAway: 'Argentina',
    matchDate: new Date(Date.now() + 7200000), status: 'SCHEDULED',
    homeScore: null, awayScore: null, phase: 'Fase de Grupos', groupLabel: 'G',
  };

  const config = { id: 'cfg-1', betAmount: 20, pixKey: null, knockoutEnabled: false, bettingEnabled: true, betDeadline: null };
  const mockJwt = { sign: jest.fn().mockReturnValue('mock-token') };
  const mockConfig = { get: jest.fn((key: string, def?: any) => key === 'JWT_REFRESH_SECRET' ? 's' : key === 'JWT_REFRESH_EXPIRATION' ? '3650d' : def) };

  describe('E01 — Cadastro', () => {
    it('deve registrar novo usuário com sucesso', async () => {
      const p = mkPrisma();
      p.user.findUnique.mockResolvedValue(null);
      p.user.create.mockResolvedValue(baseUser);

      const mod = await Test.createTestingModule({
        providers: [AuthService, { provide: PrismaService, useValue: p }, { provide: JwtService, useValue: mockJwt }, { provide: ConfigService, useValue: mockConfig }],
      }).compile();
      const auth = mod.get(AuthService);

      const r: any = await auth.register({ fullName: 'João Silva', username: 'joao', password: 'senha123' });
      expect(r.accessToken).toBe('mock-token');
      expect(r.user.username).toBe('joao');
    });
  });

  describe('E02 — Login', () => {
    it('deve autenticar e retornar JWT', async () => {
      const p = mkPrisma();
      p.user.findUnique.mockResolvedValue(baseUser);

      const mod = await Test.createTestingModule({
        providers: [AuthService, { provide: PrismaService, useValue: p }, { provide: JwtService, useValue: mockJwt }, { provide: ConfigService, useValue: mockConfig }],
      }).compile();
      const auth = mod.get(AuthService);

      const r: any = await auth.login({ username: 'joao', password: 'senha123' });
      expect(r.accessToken).toBe('mock-token');
    });
  });

  describe('E02b — Login com senha temporária (sem token)', () => {
    it('deve retornar needsNewPassword sem accessToken', async () => {
      const p = mkPrisma();
      p.user.findUnique.mockResolvedValue({ ...baseUser, isTempPassword: true });

      const mod = await Test.createTestingModule({
        providers: [AuthService, { provide: PrismaService, useValue: p }, { provide: JwtService, useValue: mockJwt }, { provide: ConfigService, useValue: mockConfig }],
      }).compile();
      const auth = mod.get(AuthService);

      const r: any = await auth.login({ username: 'joao', password: 'senha123' });
      expect(r.needsNewPassword).toBe(true);
      expect(r.accessToken).toBeUndefined();
      expect(r.userId).toBe('user-1');
    });
  });

  describe('E02c — Troca de senha temporária (sem JWT, apenas userId)', () => {
    it('deve alterar senha sem exigir token', async () => {
      jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(false as never);
      const p = mkPrisma();
      p.user.findUnique.mockResolvedValue({ ...baseUser, isTempPassword: true });
      p.user.update.mockResolvedValue({ ...baseUser, isTempPassword: false });

      const mod = await Test.createTestingModule({
        providers: [AuthService, { provide: PrismaService, useValue: p }, { provide: JwtService, useValue: mockJwt }, { provide: ConfigService, useValue: mockConfig }],
      }).compile();
      const auth = mod.get(AuthService);

      const r = await auth.setNewPassword('user-1', 'nova-senha-segura');
      expect(r.message).toContain('Senha alterada');
      expect(p.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: expect.any(String), isTempPassword: false },
      });
    });
  });

  describe('E03 — Pagamento (upload comprovante)', () => {
    it('deve criar comprovante com status PENDING', async () => {
      const p = mkPrisma();
      p.paymentReceipt.create.mockResolvedValue({ id: 'rec-1', userId: 'user-1', filePath: '/up.pdf', fileName: 'comp.pdf', mimeType: 'application/pdf', status: 'PENDING', createdAt: new Date() });

      const mod = await Test.createTestingModule({
        providers: [ReceiptsService, { provide: PrismaService, useValue: p }],
      }).compile();
      const svc = mod.get(ReceiptsService);

      const r = await svc.create({ userId: 'user-1', filePath: '/up.pdf', fileName: 'comp.pdf', mimeType: 'application/pdf' });
      expect(r.status).toBe('PENDING');
    });
  });

  describe('E04 — Aprovação admin', () => {
    it('deve aprovar comprovante e marcar hasPaid', async () => {
      const p = mkPrisma();
      p.paymentReceipt.findUnique
        .mockResolvedValueOnce({ id: 'rec-1', userId: 'user-1', status: 'PENDING', user: { id: 'user-1', fullName: 'João', username: 'joao' } })
        .mockResolvedValueOnce({ id: 'rec-1', userId: 'user-1', status: 'APPROVED' });
      p.paymentReceipt.update.mockResolvedValue({});
      p.user.update.mockResolvedValue({});

      const mod = await Test.createTestingModule({
        providers: [ReceiptsService, { provide: PrismaService, useValue: p }],
      }).compile();
      const svc = mod.get(ReceiptsService);

      const r = await svc.approve('rec-1');
      expect(r.status).toBe('APPROVED');
    });
  });

  describe('E05 — Palpite 31min antes', () => {
    it('deve salvar palpite', async () => {
      const p = mkPrisma();
      p.match.findUnique.mockResolvedValue({ ...baseMatch, matchDate: new Date(Date.now() + 31 * 60 * 1000) });
      p.prediction.findFirst.mockResolvedValue(null);
      p.prediction.create.mockResolvedValue({ id: 'pred-1', userId: 'user-1', matchId: 'match-1', predictedHome: 2, predictedAway: 1, pointsEarned: null });

      const mod = await Test.createTestingModule({
        providers: [PredictionsService, { provide: PrismaService, useValue: p }],
      }).compile();
      const svc = mod.get(PredictionsService);

      const r = await svc.create('user-1', { matchId: 'match-1', predictedHome: 2, predictedAway: 1 });
      expect(r.id).toBe('pred-1');
    });
  });

  describe('E06 — Bloqueio 29min antes', () => {
    it('deve bloquear edição', async () => {
      const p = mkPrisma();
      p.match.findUnique.mockResolvedValue({ ...baseMatch, matchDate: new Date(Date.now() + 29 * 60 * 1000 + 59 * 1000) });
      p.prediction.findUnique.mockResolvedValue({ id: 'pred-1', userId: 'user-1', matchId: 'match-1', match: { ...baseMatch, matchDate: new Date(Date.now() + 29 * 60 * 1000 + 59 * 1000) } });

      const mod = await Test.createTestingModule({
        providers: [PredictionsService, { provide: PrismaService, useValue: p }],
      }).compile();
      const svc = mod.get(PredictionsService);

      await expect(svc.update('user-1', 'pred-1', { predictedHome: 1, predictedAway: 0 })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('E07 — Admin define resultado', () => {
    it('deve atualizar placar e calcular pontos', async () => {
      const p = mkPrisma();
      const mockRankingGw = { emitRankingUpdate: jest.fn() };
      const mockRankingSvc = { getRanking: jest.fn().mockResolvedValue([{ id: 'u1', score: 5 }]) };
      const mockGamif = { checkAndAwardAchievements: jest.fn() };

      p.match.findUnique
        .mockResolvedValueOnce(baseMatch)
        .mockResolvedValueOnce({ ...baseMatch, homeScore: 2, awayScore: 1, status: 'FINISHED' });
      p.match.update.mockResolvedValue({ ...baseMatch, homeScore: 2, awayScore: 1, status: 'FINISHED' });
      p.prediction.findMany.mockResolvedValue([{ id: 'p1', userId: 'u1', predictedHome: 2, predictedAway: 1, pointsEarned: null }]);
      p.prediction.update.mockResolvedValue({});

      const mod = await Test.createTestingModule({
        providers: [
          AdminService, ScoringService,
          { provide: PrismaService, useValue: p },
          { provide: GamificationService, useValue: mockGamif },
          { provide: RankingGateway, useValue: mockRankingGw },
          { provide: RankingService, useValue: mockRankingSvc },
          { provide: NotificationsService, useValue: {} },
          { provide: ReceiptsService, useValue: { findAll: jest.fn(), approve: jest.fn(), reject: jest.fn() } },
          { provide: MatchesGateway, useValue: { emitMatchUpdate: jest.fn(), emitMatchesBatchUpdate: jest.fn(), emitLiveStatus: jest.fn() } },
        ],
      }).compile();
      const admin = mod.get(AdminService);
      const scoring = mod.get(ScoringService);

      const r = await admin.setResult('match-1', 2, 1);
      expect(r.homeScore).toBe(2);
      expect(r.awayScore).toBe(1);
      expect(r.status).toBe('FINISHED');

      const pts = (scoring as any).calculatePoints(2, 1, 2, 1);
      expect(pts).toBe(5);
      expect(mockRankingGw.emitRankingUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe('E08 — Ranking', () => {
    it('deve ordenar corretamente', async () => {
      const p = mkPrisma();
      p.user.findMany.mockResolvedValue([
        { id: 'u1', fullName: 'A', username: 'a', hasPaid: true, paidAt: new Date(2), createdAt: new Date(1), _count: { userAchievements: 0 }, predictions: [{ pointsEarned: 5, createdAt: new Date(3) }] },
        { id: 'u2', fullName: 'B', username: 'b', hasPaid: true, paidAt: new Date(1), createdAt: new Date(2), _count: { userAchievements: 0 }, predictions: [{ pointsEarned: 3, createdAt: new Date(4) }] },
      ]);
      p.systemConfig.findFirst.mockResolvedValue(config);
      p.user.count.mockResolvedValue(2);

      const mod = await Test.createTestingModule({
        providers: [RankingService, { provide: PrismaService, useValue: p }],
      }).compile();
      const svc = mod.get(RankingService);

      const ranking = await svc.getRanking();
      expect(ranking).toHaveLength(2);
      expect(ranking[0].score).toBe(5);
      expect(ranking[1].score).toBe(3);
    });
  });

  describe('E09 — Financeiro', () => {
    it('deve calcular premiação corretamente', async () => {
      const p = mkPrisma();
      p.systemConfig.findFirst.mockResolvedValue(config);
      p.user.count.mockResolvedValueOnce(10).mockResolvedValueOnce(5);
      p.user.findMany.mockResolvedValue([]);

      const mockRg = { emitRankingUpdate: jest.fn() };

      const mod = await Test.createTestingModule({
        providers: [AdminService, ScoringService,
          { provide: PrismaService, useValue: p },
          { provide: GamificationService, useValue: {} },
          { provide: RankingGateway, useValue: mockRg },
          { provide: RankingService, useValue: { getRanking: jest.fn().mockResolvedValue([]) } },
          { provide: NotificationsService, useValue: {} },
          { provide: ReceiptsService, useValue: { findAll: jest.fn(), approve: jest.fn(), reject: jest.fn() } },
          { provide: MatchesGateway, useValue: { emitMatchUpdate: jest.fn(), emitMatchesBatchUpdate: jest.fn(), emitLiveStatus: jest.fn() } },
        ],
      }).compile();
      const admin = mod.get(AdminService);

      const r = await admin.getFinancialDashboard();
      expect(r.totalCollected).toBe(200);
      expect(r.prizePool).toBe(200);
    });
  });

  describe('E10 — Liberar mata-mata', () => {
    it('deve ativar knockoutEnabled', async () => {
      const p = mkPrisma();
      p.systemConfig.findFirst.mockResolvedValue(config);
      p.systemConfig.update.mockResolvedValue({ ...config, knockoutEnabled: true });

      const mockRg = { emitRankingUpdate: jest.fn() };

      const mod = await Test.createTestingModule({
        providers: [AdminService, ScoringService,
          { provide: PrismaService, useValue: p },
          { provide: GamificationService, useValue: {} },
          { provide: RankingGateway, useValue: mockRg },
          { provide: RankingService, useValue: { getRanking: jest.fn().mockResolvedValue([]) } },
          { provide: NotificationsService, useValue: {} },
          { provide: ReceiptsService, useValue: { findAll: jest.fn(), approve: jest.fn(), reject: jest.fn() } },
          { provide: MatchesGateway, useValue: { emitMatchUpdate: jest.fn(), emitMatchesBatchUpdate: jest.fn(), emitLiveStatus: jest.fn() } },
        ],
      }).compile();
      const admin = mod.get(AdminService);

      const r = await admin.unlockKnockout();
      expect(r.knockoutEnabled).toBe(true);
    });
  });
});
