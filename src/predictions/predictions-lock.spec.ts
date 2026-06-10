import { Test, TestingModule } from '@nestjs/testing';
import { PredictionsService, PREDICTION_LOCK_MINUTES } from './predictions.service';
import { FootballApiService } from '../football-api/football-api.service';
import { PrismaService } from '../common/prisma.service';
import { ConfigService } from '@nestjs/config';
import { ScoringService } from '../admin/scoring.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('Regra de bloqueio de palpites — 30 minutos', () => {
  let service: PredictionsService;

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    const mockPrisma = {
      match: { findUnique: jest.fn() },
      prediction: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PredictionsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PredictionsService>(PredictionsService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function mock(): any {
    const prisma = (service as any).prisma;
    return prisma;
  }

  describe('GRUPO 1 — Regra central de bloqueio', () => {
    it('T01 — deve permitir edição com 31 minutos de antecedência', async () => {
      const p = mock();
      p.match.findUnique.mockResolvedValue({
        id: 'm1', matchDate: new Date(Date.now() + 31 * 60 * 1000 + 1000), status: 'SCHEDULED',
      });
      p.prediction.findUnique.mockResolvedValue(null);
      p.prediction.create.mockResolvedValue({ id: 'p1' });

      const result = await service.create('u1', { matchId: 'm1', predictedHome: 1, predictedAway: 0 });
      expect(result).toBeDefined();
      expect(p.prediction.create).toHaveBeenCalled();
    });

    it('T02 — deve permitir edição com exatamente 30 minutos de antecedência', async () => {
      const p = mock();
      p.match.findUnique.mockResolvedValue({
        id: 'm1', matchDate: new Date(Date.now() + 30 * 60 * 1000), status: 'SCHEDULED',
      });
      p.prediction.findUnique.mockResolvedValue(null);
      p.prediction.create.mockResolvedValue({ id: 'p1' });

      const result = await service.create('u1', { matchId: 'm1', predictedHome: 2, predictedAway: 1 });
      expect(result).toBeDefined();
    });

    it('T03 — deve bloquear com 29 minutos e 59 segundos de antecedência', async () => {
      const p = mock();
      p.match.findUnique.mockResolvedValue({
        id: 'm1', matchDate: new Date(Date.now() + 29 * 60 * 1000 + 59 * 1000), status: 'SCHEDULED',
      });

      await expect(
        service.create('u1', { matchId: 'm1', predictedHome: 1, predictedAway: 0 })
      ).rejects.toThrow(ForbiddenException);
    });

    it('T04 — deve bloquear 1 segundo antes da partida', async () => {
      const p = mock();
      p.match.findUnique.mockResolvedValue({
        id: 'm1', matchDate: new Date(Date.now() + 1000), status: 'SCHEDULED',
      });

      await expect(
        service.create('u1', { matchId: 'm1', predictedHome: 0, predictedAway: 0 })
      ).rejects.toThrow(ForbiddenException);
    });

    it('T05 — deve bloquear exatamente no horário da partida', async () => {
      const p = mock();
      p.match.findUnique.mockResolvedValue({
        id: 'm1', matchDate: new Date(Date.now()), status: 'SCHEDULED',
      });

      await expect(
        service.create('u1', { matchId: 'm1', predictedHome: 1, predictedAway: 1 })
      ).rejects.toThrow(ForbiddenException);
    });

    it('T06 — deve bloquear 10 minutos após o início', async () => {
      const p = mock();
      p.match.findUnique.mockResolvedValue({
        id: 'm1', matchDate: new Date(Date.now() - 10 * 60 * 1000), status: 'IN_PROGRESS',
      });

      await expect(
        service.create('u1', { matchId: 'm1', predictedHome: 2, predictedAway: 2 })
      ).rejects.toThrow(ForbiddenException);
    });

    it('T07 — deve bloquear partida encerrada (2h depois)', async () => {
      const p = mock();
      p.match.findUnique.mockResolvedValue({
        id: 'm1', matchDate: new Date(Date.now() - 2 * 60 * 60 * 1000), status: 'FINISHED',
      });

      await expect(
        service.create('u1', { matchId: 'm1', predictedHome: 3, predictedAway: 0 })
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('GRUPO 2 — Fuso horário (timezone-safe)', () => {
    it('T08 — partida 13:00 BRT, verificação 12:29 BRT → permite', async () => {
      const p = mock();
      p.match.findUnique.mockResolvedValue({
        id: 'm1', matchDate: new Date('2026-06-11T16:00:00.000Z'), status: 'SCHEDULED',
      });
      p.prediction.findUnique.mockResolvedValue(null);
      p.prediction.create.mockResolvedValue({ id: 'p1' });
      jest.setSystemTime(new Date('2026-06-11T15:29:00.000Z'));

      const result = await service.create('u1', { matchId: 'm1', predictedHome: 1, predictedAway: 0 });
      expect(result).toBeDefined();
    });

    it('T09 — partida 13:00 BRT, verificação 12:30 BRT → permite (limite exato)', async () => {
      const p = mock();
      p.match.findUnique.mockResolvedValue({
        id: 'm1', matchDate: new Date('2026-06-11T16:00:00.000Z'), status: 'SCHEDULED',
      });
      p.prediction.findUnique.mockResolvedValue(null);
      p.prediction.create.mockResolvedValue({ id: 'p1' });
      jest.setSystemTime(new Date('2026-06-11T15:30:00.000Z'));

      const result = await service.create('u1', { matchId: 'm1', predictedHome: 2, predictedAway: 1 });
      expect(result).toBeDefined();
    });

    it('T10 — partida 13:00 BRT, verificação 12:31 BRT → bloqueia', async () => {
      const p = mock();
      p.match.findUnique.mockResolvedValue({
        id: 'm1', matchDate: new Date('2026-06-11T16:00:00.000Z'), status: 'SCHEDULED',
      });
      jest.setSystemTime(new Date('2026-06-11T15:31:00.000Z'));

      await expect(
        service.create('u1', { matchId: 'm1', predictedHome: 1, predictedAway: 0 })
      ).rejects.toThrow(ForbiddenException);
    });

    it('T11 — servidor UTC bloqueia no horário correto de Brasília', async () => {
      const p = mock();
      p.match.findUnique.mockResolvedValue({
        id: 'm1', matchDate: new Date('2026-06-11T20:00:00.000Z'), status: 'SCHEDULED',
      });
      jest.setSystemTime(new Date('2026-06-11T19:31:00.000Z'));

      await expect(
        service.create('u1', { matchId: 'm1', predictedHome: 1, predictedAway: 1 })
      ).rejects.toThrow(ForbiddenException);
    });

    it('T12 — servidor UTC+9 (Tóquio) não altera a regra', async () => {
      const p = mock();
      p.match.findUnique.mockResolvedValue({
        id: 'm1', matchDate: new Date('2026-06-12T02:00:00.000Z'), status: 'SCHEDULED',
      });
      jest.setSystemTime(new Date('2026-06-12T01:31:00.000Z'));

      await expect(
        service.create('u1', { matchId: 'm1', predictedHome: 0, predictedAway: 1 })
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('GRUPO 3 — parseLocalDate com fallback', () => {
    let footballApi: FootballApiService;

    beforeEach(async () => {
      const mockPrisma = {
        match: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), create: jest.fn() },
        prediction: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
        $transaction: jest.fn(),
      };
      const mockConfig = { get: jest.fn(() => 'https://worldcup26.ir') };
      const mockScoring = { calculateAndDistributePoints: jest.fn() };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          FootballApiService,
          { provide: ConfigService, useValue: mockConfig },
          { provide: PrismaService, useValue: mockPrisma },
          { provide: ScoringService, useValue: mockScoring },
        ],
      }).compile();

      footballApi = module.get<FootballApiService>(FootballApiService);
    });

    it('T13 — stadium_id conhecido (Azteca UTC-6) usa offset do estádio', () => {
      const result = (footballApi as any).parseLocalDate('06/11/2026 13:00', -6);
      expect(result.toISOString()).toBe('2026-06-11T19:00:00.000Z');
    });

    it('T14 — stadium_id desconhecido usa fallback UTC', () => {
      const result = (footballApi as any).parseLocalDate('06/11/2026 13:00');
      expect(result.toISOString()).toBe('2026-06-11T13:00:00.000Z');
    });

    it('T15 — stadium_id null/undefined usa fallback UTC', () => {
      const r1 = (footballApi as any).parseLocalDate('07/19/2026 15:00');
      const r2 = (footballApi as any).parseLocalDate('07/19/2026 15:00', null);
      expect(r1.toISOString()).toBe('2026-07-19T15:00:00.000Z');
      expect(r2.toISOString()).toBe('2026-07-19T15:00:00.000Z');
    });
  });

  describe('GRUPO 4 — Mensagem de erro', () => {
    it('T16 — mensagem exibe horário no formato pt-BR com timezone BRT', async () => {
      const p = mock();
      p.match.findUnique.mockResolvedValue({
        id: 'm1', matchDate: new Date('2026-06-11T16:00:00.000Z'), status: 'SCHEDULED',
      });
      jest.setSystemTime(new Date('2026-06-11T15:31:00.000Z'));

      let error: any;
      try { await service.create('u1', { matchId: 'm1', predictedHome: 1, predictedAway: 0 }); }
      catch (e) { error = e; }

      expect(error).toBeInstanceOf(ForbiddenException);
      const msg: string = error.message;
      expect(msg).toContain('encerrados');
      expect(msg).toContain(`${PREDICTION_LOCK_MINUTES}min`);
      expect(msg).toContain('12:30:00'); // lock deadline 15:30 UTC = 12:30 BRT
    });

    it('T17 — com servidor UTC, mensagem exibe horário em BRT', async () => {
      const p = mock();
      p.match.findUnique.mockResolvedValue({
        id: 'm1', matchDate: new Date('2026-06-11T16:00:00.000Z'), status: 'SCHEDULED',
      });
      jest.setSystemTime(new Date('2026-06-11T15:31:00.000Z'));

      let error: any;
      try { await service.create('u1', { matchId: 'm1', predictedHome: 2, predictedAway: 2 }); }
      catch (e) { error = e; }

      expect(error.message).toContain('12:30:00');
    });

    it('T18 — formato da mensagem tem data/hora no padrão brasileiro', async () => {
      const p = mock();
      p.match.findUnique.mockResolvedValue({
        id: 'm1', matchDate: new Date('2026-06-11T16:00:00.000Z'), status: 'SCHEDULED',
      });
      jest.setSystemTime(new Date('2026-06-11T15:31:00.000Z'));

      let error: any;
      try { await service.create('u1', { matchId: 'm1', predictedHome: 0, predictedAway: 3 }); }
      catch (e) { error = e; }

      const msg: string = error.message;
      expect(msg).toMatch(/Palpites encerrados/);
      expect(msg).toMatch(/\d{2}\/\d{2}\/\d{4}/);
      expect(msg).toMatch(/\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('GRUPO 5 — Edge cases', () => {
    it('T19 — partida não encontrada lança NotFoundException', async () => {
      const p = mock();
      p.match.findUnique.mockResolvedValue(null);

      await expect(
        service.create('u1', { matchId: 'inexistente', predictedHome: 1, predictedAway: 0 })
      ).rejects.toThrow(NotFoundException);
    });

    it('T20 — matchDate inválido lança erro em getTime', async () => {
      const p = mock();
      p.match.findUnique.mockResolvedValue({
        id: 'm1', matchDate: 'data-invalida' as any, status: 'SCHEDULED',
      });

      await expect(
        service.create('u1', { matchId: 'm1', predictedHome: 1, predictedAway: 1 })
      ).rejects.toThrow();
    });

    it('T21 — dois usuários simultâneos dentro da janela de bloqueio', async () => {
      const p = mock();
      p.match.findUnique.mockResolvedValue({
        id: 'm1', matchDate: new Date(Date.now() + 25 * 60 * 1000), status: 'SCHEDULED',
      });
      p.prediction.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      p.prediction.create.mockResolvedValue({ id: 'p1' });

      const p1 = service.create('u1', { matchId: 'm1', predictedHome: 1, predictedAway: 0 });
      const p2 = service.create('u2', { matchId: 'm1', predictedHome: 2, predictedAway: 1 });

      await expect(p1).rejects.toThrow(ForbiddenException);
      await expect(p2).rejects.toThrow(ForbiddenException);
    });

    it('T22 — DST não impacta regra (usa UTC)', async () => {
      const p = mock();
      p.match.findUnique.mockResolvedValue({
        id: 'm1', matchDate: new Date('2026-11-14T20:00:00.000Z'), status: 'SCHEDULED',
      });
      jest.setSystemTime(new Date('2026-11-14T19:31:00.000Z'));

      await expect(
        service.create('u1', { matchId: 'm1', predictedHome: 0, predictedAway: 0 })
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Testes do método getLockDeadline', () => {
    it('deve retornar matchDate - 30 minutos', () => {
      const d = (service as any).getLockDeadline(new Date('2026-06-11T19:00:00Z'));
      expect(d.toISOString()).toBe('2026-06-11T18:30:00.000Z');
    });
  });

  describe('Testes de update (edição de palpite)', () => {
    it('deve lançar NotFoundException se palpite não existir', async () => {
      const p = mock();
      p.prediction.findUnique.mockResolvedValue(null);

      await expect(
        service.update('u1', 'p1', { predictedHome: 2, predictedAway: 1 })
      ).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ForbiddenException se palpite não pertence ao usuário', async () => {
      const p = mock();
      p.prediction.findUnique.mockResolvedValue({
        id: 'p1', userId: 'u2',
        match: { matchDate: new Date(Date.now() + 60 * 60 * 1000) },
      });

      await expect(
        service.update('u1', 'p1', { predictedHome: 2, predictedAway: 1 })
      ).rejects.toThrow(ForbiddenException);
    });

    it('deve permitir edição com 31 minutos de antecedência (update)', async () => {
      const p = mock();
      p.prediction.findUnique.mockResolvedValue({
        id: 'p1', userId: 'u1',
        match: { matchDate: new Date(Date.now() + 31 * 60 * 1000 + 1000) },
      });
      p.prediction.update.mockResolvedValue({ id: 'p1' });

      const result = await service.update('u1', 'p1', { predictedHome: 3, predictedAway: 0 });
      expect(result).toBeDefined();
    });

    it('deve bloquear edição 29 minutos antes (update)', async () => {
      const p = mock();
      p.prediction.findUnique.mockResolvedValue({
        id: 'p1', userId: 'u1',
        match: { matchDate: new Date(Date.now() + 29 * 60 * 1000 + 59 * 1000) },
      });

      await expect(
        service.update('u1', 'p1', { predictedHome: 0, predictedAway: 1 })
      ).rejects.toThrow(ForbiddenException);
    });

    it('deve bloquear edição após início da partida (update)', async () => {
      const p = mock();
      p.prediction.findUnique.mockResolvedValue({
        id: 'p1', userId: 'u1',
        match: { matchDate: new Date(Date.now() - 10 * 60 * 1000) },
      });

      await expect(
        service.update('u1', 'p1', { predictedHome: 0, predictedAway: 0 })
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
