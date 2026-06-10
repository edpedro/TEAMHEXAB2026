import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { PrismaService } from '../common/prisma.service';

describe('MatchesService', () => {
  let service: MatchesService;
  let prisma: any;

  const mockPrisma = {
    match: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const baseMatch = {
    id: 'match-1',
    teamHome: 'Brasil',
    teamAway: 'Argentina',
    teamHomeIso: 'BR',
    teamAwayIso: 'AR',
    flagHome: null,
    flagAway: null,
    stadium: 'Maracanã',
    city: 'Rio de Janeiro',
    country: 'Brasil',
    groupLabel: 'G',
    matchDate: new Date('2026-06-15T21:00:00Z'),
    phase: 'Fase de Grupos',
    status: 'SCHEDULED',
    homeScore: null,
    awayScore: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<MatchesService>(MatchesService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('deve retornar todas as partidas ordenadas por data', async () => {
      mockPrisma.match.findMany.mockResolvedValue([baseMatch]);

      const result = await service.findAll();
      expect(result).toHaveLength(1);
      expect(mockPrisma.match.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { matchDate: 'asc' },
      });
    });

    it('deve filtrar por fase', async () => {
      mockPrisma.match.findMany.mockResolvedValue([baseMatch]);

      await service.findAll('Fase de Grupos');
      expect(mockPrisma.match.findMany).toHaveBeenCalledWith({
        where: { phase: 'Fase de Grupos' },
        orderBy: { matchDate: 'asc' },
      });
    });

    it('deve filtrar por status', async () => {
      mockPrisma.match.findMany.mockResolvedValue([baseMatch]);

      await service.findAll(undefined, 'FINISHED');
      expect(mockPrisma.match.findMany).toHaveBeenCalledWith({
        where: { status: 'FINISHED' },
        orderBy: { matchDate: 'asc' },
      });
    });
  });

  describe('findById', () => {
    it('deve retornar partida com predictions', async () => {
      mockPrisma.match.findUnique.mockResolvedValue({ ...baseMatch, predictions: [] });

      const result = await service.findById('match-1');
      expect(result.id).toBe('match-1');
      expect(mockPrisma.match.findUnique).toHaveBeenCalledWith({
        where: { id: 'match-1' },
        include: {
          predictions: {
            select: {
              id: true,
              predictedHome: true,
              predictedAway: true,
              pointsEarned: true,
              user: { select: { id: true, username: true } },
            },
          },
        },
      });
    });

    it('deve lançar NotFoundException se não encontrada', async () => {
      mockPrisma.match.findUnique.mockResolvedValue(null);
      await expect(service.findById('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('deve criar partida', async () => {
      const dto = {
        teamHome: 'Brasil',
        teamAway: 'Argentina',
        matchDate: new Date('2026-06-15'),
        phase: 'Fase de Grupos',
      };
      mockPrisma.match.create.mockResolvedValue(baseMatch);

      const result = await service.create(dto as any);
      expect(result.id).toBe('match-1');
    });
  });

  describe('update', () => {
    it('deve atualizar partida existente', async () => {
      mockPrisma.match.findUnique.mockResolvedValue(baseMatch);
      mockPrisma.match.update.mockResolvedValue({ ...baseMatch, stadium: 'Ninho do Pássaro' });

      const result = await service.update('match-1', { stadium: 'Ninho do Pássaro' } as any);
      expect(result.stadium).toBe('Ninho do Pássaro');
    });

    it('deve lançar NotFoundException se não encontrada', async () => {
      mockPrisma.match.findUnique.mockResolvedValue(null);
      await expect(service.update('999', {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deve remover partida existente', async () => {
      mockPrisma.match.findUnique.mockResolvedValue(baseMatch);
      mockPrisma.match.delete.mockResolvedValue(baseMatch);

      const result = await service.remove('match-1');
      expect(result.message).toContain('removida');
    });

    it('deve lançar NotFoundException se não encontrada', async () => {
      mockPrisma.match.findUnique.mockResolvedValue(null);
      await expect(service.remove('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getUpcoming', () => {
    it('deve retornar próximas partidas', async () => {
      mockPrisma.match.findMany.mockResolvedValue([baseMatch]);

      const result = await service.getUpcoming(5);
      expect(result).toHaveLength(1);
      expect(mockPrisma.match.findMany).toHaveBeenCalledWith({
        where: {
          status: 'SCHEDULED',
          matchDate: { gte: expect.any(Date) },
        },
        orderBy: { matchDate: 'asc' },
        take: 5,
      });
    });
  });

  describe('getRecentResults', () => {
    it('deve retornar resultados recentes', async () => {
      const finished = { ...baseMatch, status: 'FINISHED', homeScore: 2, awayScore: 1 };
      mockPrisma.match.findMany.mockResolvedValue([finished]);

      const result = await service.getRecentResults(5);
      expect(result).toHaveLength(1);
      expect(mockPrisma.match.findMany).toHaveBeenCalledWith({
        where: { status: 'FINISHED' },
        orderBy: { matchDate: 'desc' },
        take: 5,
      });
    });
  });
});
