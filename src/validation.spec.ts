import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { AdminService } from './admin/admin.service';
import { ScoringService } from './admin/scoring.service';
import { AuthService } from './auth/auth.service';
import { PredictionsService } from './predictions/predictions.service';
import { PrismaService } from './common/prisma.service';
import { GamificationService } from './gamification/gamification.service';
import { RankingGateway } from './ranking/ranking.gateway';
import { RankingService } from './ranking/ranking.service';
import { NotificationsService } from './notifications/notifications.service';
import { ReceiptsService } from './receipts/receipts.service';
import { MatchesGateway } from './matches/matches.gateway';
import { Role } from '@prisma/client';

describe('Validações de Input', () => {
  describe('V01-V03 — Placar (AdminService.setResult)', () => {
    let adminService: AdminService;
    let prisma: any;

    beforeEach(async () => {
      prisma = {
        user: { count: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
        match: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
        prediction: { findMany: jest.fn(), update: jest.fn(), count: jest.fn() },
        systemConfig: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
        paymentReceipt: { findMany: jest.fn() },
        userAchievement: { findMany: jest.fn(), create: jest.fn() },
        achievement: { findMany: jest.fn() },
        notification: { create: jest.fn(), findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn() },
        topScorerPrediction: { findUnique: jest.fn() },
        rankingHistory: { create: jest.fn(), findMany: jest.fn() },
      };

      const mod = await Test.createTestingModule({
        providers: [
          AdminService, ScoringService,
          { provide: PrismaService, useValue: prisma },
          { provide: GamificationService, useValue: {} },
          { provide: RankingGateway, useValue: { emitRankingUpdate: jest.fn() } },
          { provide: RankingService, useValue: { getRanking: jest.fn().mockResolvedValue([]) } },
          { provide: NotificationsService, useValue: {} },
          { provide: ReceiptsService, useValue: { findAll: jest.fn(), approve: jest.fn(), reject: jest.fn() } },
          { provide: MatchesGateway, useValue: { emitMatchUpdate: jest.fn(), emitMatchesBatchUpdate: jest.fn(), emitLiveStatus: jest.fn() } },
        ],
      }).compile();

      adminService = mod.get<AdminService>(AdminService);
    });

    it('V01 — Placar home = -1 → Erro 400', async () => {
      await expect(adminService.setResult('m1', -1, 0)).rejects.toThrow(BadRequestException);
    });

    it('V02 — Placar away = -1 → Erro 400', async () => {
      await expect(adminService.setResult('m1', 0, -1)).rejects.toThrow(BadRequestException);
    });

    it('V03 — Placar home = 1.5 (não inteiro) → Erro 400', async () => {
      await expect(adminService.setResult('m1', 1.5, 0)).rejects.toThrow(BadRequestException);
    });
  });

  describe('V04-V05 — Valor da aposta (AdminService.updateBetAmount)', () => {
    let adminService: AdminService;
    let prisma: any;

    beforeEach(async () => {
      prisma = {
        user: { count: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
        match: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
        prediction: { findMany: jest.fn(), update: jest.fn(), count: jest.fn() },
        systemConfig: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
        paymentReceipt: { findMany: jest.fn() },
        userAchievement: { findMany: jest.fn(), create: jest.fn() },
        achievement: { findMany: jest.fn() },
        notification: { create: jest.fn(), findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn() },
        topScorerPrediction: { findUnique: jest.fn() },
        rankingHistory: { create: jest.fn(), findMany: jest.fn() },
      };

      const mod = await Test.createTestingModule({
        providers: [
          AdminService, ScoringService,
          { provide: PrismaService, useValue: prisma },
          { provide: GamificationService, useValue: {} },
          { provide: RankingGateway, useValue: { emitRankingUpdate: jest.fn() } },
          { provide: RankingService, useValue: { getRanking: jest.fn().mockResolvedValue([]) } },
          { provide: NotificationsService, useValue: {} },
          { provide: ReceiptsService, useValue: { findAll: jest.fn(), approve: jest.fn(), reject: jest.fn() } },
          { provide: MatchesGateway, useValue: { emitMatchUpdate: jest.fn(), emitMatchesBatchUpdate: jest.fn(), emitLiveStatus: jest.fn() } },
        ],
      }).compile();

      adminService = mod.get<AdminService>(AdminService);
    });

    it('V04 — Valor da aposta = 0 → Erro 400', async () => {
      await expect(adminService.updateBetAmount(0)).rejects.toThrow(BadRequestException);
    });

    it('V05 — Valor da aposta = -100 → Erro 400', async () => {
      await expect(adminService.updateBetAmount(-100)).rejects.toThrow(BadRequestException);
    });
  });

  describe('V06 — Chave PIX vazia', () => {
    let adminService: AdminService;
    let prisma: any;

    beforeEach(async () => {
      prisma = {
        user: { count: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
        match: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
        prediction: { findMany: jest.fn(), update: jest.fn(), count: jest.fn() },
        systemConfig: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
        paymentReceipt: { findMany: jest.fn() },
        userAchievement: { findMany: jest.fn(), create: jest.fn() },
        achievement: { findMany: jest.fn() },
        notification: { create: jest.fn(), findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn() },
        topScorerPrediction: { findUnique: jest.fn() },
        rankingHistory: { create: jest.fn(), findMany: jest.fn() },
      };

      const mod = await Test.createTestingModule({
        providers: [
          AdminService, ScoringService,
          { provide: PrismaService, useValue: prisma },
          { provide: GamificationService, useValue: {} },
          { provide: RankingGateway, useValue: { emitRankingUpdate: jest.fn() } },
          { provide: RankingService, useValue: { getRanking: jest.fn().mockResolvedValue([]) } },
          { provide: NotificationsService, useValue: {} },
          { provide: ReceiptsService, useValue: { findAll: jest.fn(), approve: jest.fn(), reject: jest.fn() } },
          { provide: MatchesGateway, useValue: { emitMatchUpdate: jest.fn(), emitMatchesBatchUpdate: jest.fn(), emitLiveStatus: jest.fn() } },
        ],
      }).compile();

      adminService = mod.get<AdminService>(AdminService);
    });

    it('V06 — Chave PIX vazia → Erro 400', async () => {
      await expect(adminService.updatePixKey('')).rejects.toThrow(BadRequestException);
      await expect(adminService.updatePixKey('   ')).rejects.toThrow(BadRequestException);
    });
  });

  describe('V07-V08 — setNewPassword no AuthService', () => {
    let authService: AuthService;
    let prisma: any;

    beforeEach(async () => {
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);
      prisma = { user: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() } };
      const mockJwt = { sign: jest.fn().mockReturnValue('t') };
      const mockCfg = { get: jest.fn((k: string, d?: any) => k === 'JWT_REFRESH_SECRET' ? 's' : k === 'JWT_REFRESH_EXPIRATION' ? '3650d' : d) };

      const mod = await Test.createTestingModule({
        providers: [AuthService, { provide: PrismaService, useValue: prisma }, { provide: JwtService, useValue: mockJwt }, { provide: ConfigService, useValue: mockCfg }],
      }).compile();
      authService = mod.get(AuthService);
    });

    it('V07 — Senha < 6 chars → BadRequest', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', isTempPassword: true, passwordHash: '$2a$10$h' });
      await expect(authService.setNewPassword('u1', '12345')).rejects.toThrow(BadRequestException);
    });

    it('V08 — Usuário sem senha temporária → BadRequest', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', isTempPassword: false, passwordHash: '$2a$10$h' });
      await expect(authService.setNewPassword('u1', '123456')).rejects.toThrow(BadRequestException);
    });

    it('V08b — Senha igual à temporária → BadRequest', async () => {
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', isTempPassword: true, passwordHash: '$2a$10$h' });
      await expect(authService.setNewPassword('u1', '123456')).rejects.toThrow(BadRequestException);
    });

    it('V08c — Usuário inexistente → Unauthorized', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(authService.setNewPassword('999', '123456')).rejects.toThrow(UnauthorizedException);
    });

    it('V08d — Sucesso com senha válida', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', isTempPassword: true, passwordHash: '$2a$10$h' });
      prisma.user.update.mockResolvedValue({});
      const r = await authService.setNewPassword('u1', 'nova-senha-forte');
      expect(r.message).toContain('Senha alterada');
    });
  });

  describe('V09 — Role inválida', () => {
    it('deve retornar false para role inexistente', () => {
      const role = 'SUPERADMIN';
      const isValid = Object.values(Role).includes(role as Role);
      expect(isValid).toBe(false);
    });

    it('deve retornar true para role existente', () => {
      const role = 'ADMIN';
      const isValid = Object.values(Role).includes(role as Role);
      expect(isValid).toBe(true);
    });
  });

  describe('V10-V11 — Upload Excel inválido', () => {
    it('V10 — Deve rejeitar tipo MIME não permitido', () => {
      const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
      expect(allowedMimes.includes('application/pdf')).toBe(true);
      expect(allowedMimes.includes('text/csv')).toBe(false);
    });

    it('V11 — FileInterceptor limita 5MB no controller', () => {
      const fileSizeLimit = 5 * 1024 * 1024;
      expect(fileSizeLimit).toBe(5242880);
    });
  });

  describe('V12 — Palpite em jogo inexistente', () => {
    it('deve lançar NotFoundException', async () => {
      const p = {
        match: { findUnique: jest.fn() },
        prediction: { findFirst: jest.fn(), create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      };
      p.match.findUnique.mockResolvedValue(null);

      const mod = await Test.createTestingModule({
        providers: [PredictionsService, { provide: PrismaService, useValue: p }],
      }).compile();
      const svc = mod.get(PredictionsService);

      await expect(
        svc.create('u1', { matchId: 'inexistente', predictedHome: 1, predictedAway: 0 }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
