import { Test, TestingModule } from '@nestjs/testing';
import { PredictionsService, PREDICTION_LOCK_MINUTES } from './predictions.service';
import { PrismaService } from '../common/prisma.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('PredictionsService', () => {
  let service: PredictionsService;
  const mockPrisma = {
    match: { findUnique: jest.fn() },
    prediction: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PredictionsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PredictionsService>(PredictionsService);
  });

  afterEach(() => jest.clearAllMocks());

  const FUTURE_MATCH = {
    id: 'm1', matchDate: new Date(Date.now() + 32 * 60 * 1000), // 32 min in future
    status: 'SCHEDULED',
  };

  describe('getLockDeadline', () => {
    it('deve retornar matchDate - 30 minutos', () => {
      const matchDate = new Date('2026-06-11T19:00:00Z');
      const deadline = (service as any).getLockDeadline(matchDate);
      expect(deadline.toISOString()).toBe('2026-06-11T18:30:00.000Z');
    });
  });

  describe('create', () => {
    it('deve lançar NotFoundException se partida não existir', async () => {
      mockPrisma.match.findUnique.mockResolvedValue(null);
      await expect(service.create('u1', { matchId: 'm1', predictedHome: 1, predictedAway: 0 }))
        .rejects.toThrow(NotFoundException);
    });

    it('deve permitir palpite 31 minutos antes do jogo', async () => {
      const match = { ...FUTURE_MATCH, matchDate: new Date(Date.now() + 31 * 60 * 1000 + 1000) }; // 31min 1s
      mockPrisma.match.findUnique.mockResolvedValue(match);
      mockPrisma.prediction.findUnique.mockResolvedValue(null);
      mockPrisma.prediction.create.mockResolvedValue({ id: 'p1' });

      const result = await service.create('u1', { matchId: 'm1', predictedHome: 2, predictedAway: 1 });
      expect(result).toBeDefined();
      expect(mockPrisma.prediction.create).toHaveBeenCalled();
    });

    it('deve permitir palpite exatamente 30 minutos antes', async () => {
      const match = { ...FUTURE_MATCH, matchDate: new Date(Date.now() + 30 * 60 * 1000 + 100) }; // 30min + 100ms
      mockPrisma.match.findUnique.mockResolvedValue(match);
      mockPrisma.prediction.findUnique.mockResolvedValue(null);
      mockPrisma.prediction.create.mockResolvedValue({ id: 'p1' });

      const result = await service.create('u1', { matchId: 'm1', predictedHome: 1, predictedAway: 1 });
      expect(result).toBeDefined();
    });

    it('deve bloquear palpite 29 minutos e 59 segundos antes', async () => {
      const match = { ...FUTURE_MATCH, matchDate: new Date(Date.now() + 29 * 60 * 1000 + 59 * 1000) };
      mockPrisma.match.findUnique.mockResolvedValue(match);

      await expect(service.create('u1', { matchId: 'm1', predictedHome: 1, predictedAway: 0 }))
        .rejects.toThrow(ForbiddenException);
    });

    it('deve bloquear palpite para partida já iniciada', async () => {
      const match = { ...FUTURE_MATCH, matchDate: new Date(Date.now() - 5 * 60 * 1000) }; // 5 min ago
      mockPrisma.match.findUnique.mockResolvedValue(match);

      await expect(service.create('u1', { matchId: 'm1', predictedHome: 2, predictedAway: 2 }))
        .rejects.toThrow(ForbiddenException);
    });

    it('deve bloquear palpite para partida encerrada', async () => {
      const match = { ...FUTURE_MATCH, matchDate: new Date(Date.now() - 2 * 60 * 60 * 1000), status: 'FINISHED' }; // 2h ago
      mockPrisma.match.findUnique.mockResolvedValue(match);

      await expect(service.create('u1', { matchId: 'm1', predictedHome: 0, predictedAway: 0 }))
        .rejects.toThrow(ForbiddenException);
    });

    it('deve bloquear palpite duplicado para mesma partida', async () => {
      mockPrisma.match.findUnique.mockResolvedValue(FUTURE_MATCH);
      mockPrisma.prediction.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.create('u1', { matchId: 'm1', predictedHome: 1, predictedAway: 2 }))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    const EXISTING_PREDICTION = {
      id: 'p1', userId: 'u1',
      match: { matchDate: new Date(Date.now() + 32 * 60 * 1000) },
    };

    it('deve lançar NotFoundException se palpite não existir', async () => {
      mockPrisma.prediction.findUnique.mockResolvedValue(null);
      await expect(service.update('u1', 'p1', { predictedHome: 2, predictedAway: 1 }))
        .rejects.toThrow(NotFoundException);
    });

    it('deve lançar ForbiddenException se palpite não pertence ao usuário', async () => {
      mockPrisma.prediction.findUnique.mockResolvedValue({ ...EXISTING_PREDICTION, userId: 'u2' });
      await expect(service.update('u1', 'p1', { predictedHome: 2, predictedAway: 1 }))
        .rejects.toThrow(ForbiddenException);
    });

    it('deve permitir edição 31 minutos antes', async () => {
      mockPrisma.prediction.findUnique.mockResolvedValue(EXISTING_PREDICTION);
      mockPrisma.prediction.update.mockResolvedValue({ id: 'p1' });

      const result = await service.update('u1', 'p1', { predictedHome: 3, predictedAway: 0 });
      expect(result).toBeDefined();
    });

    it('deve bloquear edição 29 minutos antes', async () => {
      mockPrisma.prediction.findUnique.mockResolvedValue({
        ...EXISTING_PREDICTION,
        match: { matchDate: new Date(Date.now() + 29 * 60 * 1000 + 59 * 1000) },
      });

      await expect(service.update('u1', 'p1', { predictedHome: 0, predictedAway: 1 }))
        .rejects.toThrow(ForbiddenException);
    });

    it('deve bloquear edição após início da partida', async () => {
      mockPrisma.prediction.findUnique.mockResolvedValue({
        ...EXISTING_PREDICTION,
        match: { matchDate: new Date(Date.now() - 10 * 60 * 1000) },
      });

      await expect(service.update('u1', 'p1', { predictedHome: 0, predictedAway: 0 }))
        .rejects.toThrow(ForbiddenException);
    });
  });
});
