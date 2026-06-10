import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { TopScorersService } from './top-scorers.service';
import { PrismaService } from '../common/prisma.service';

describe('TopScorersService', () => {
  let service: TopScorersService;
  let prisma: any;

  const mockPrisma = {
    topScorerPrediction: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
    systemConfig: {
      findFirst: jest.fn(),
    },
  };

  const basePrediction = {
    id: 'ts-1',
    userId: 'user-1',
    player1: 'Messi',
    player2: 'Ronaldo',
    player3: 'Neymar',
    player4: 'Mbappe',
    player5: 'Haaland',
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: 'user-1', fullName: 'João', username: 'joao' },
  };

  const players = ['Messi', 'Ronaldo', 'Neymar', 'Mbappe', 'Haaland'];

  const createDto = { players } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TopScorersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TopScorersService>(TopScorersService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByUser', () => {
    it('deve retornar prediction formatada quando existe', async () => {
      mockPrisma.topScorerPrediction.findUnique.mockResolvedValue(basePrediction);

      const result = await service.findByUser('user-1')!;
      expect(result!.players).toEqual(players);
      expect(result!.id).toBe('ts-1');
    });

    it('deve retornar null quando não existe', async () => {
      mockPrisma.topScorerPrediction.findUnique.mockResolvedValue(null);

      const result = await service.findByUser('user-1');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('deve criar prediction quando não existe', async () => {
      mockPrisma.topScorerPrediction.findUnique.mockResolvedValue(null);
      mockPrisma.systemConfig.findFirst.mockResolvedValue({ betDeadline: null });
      mockPrisma.topScorerPrediction.create.mockResolvedValue(basePrediction);

      const result = await service.create('user-1', createDto);
      expect(result.players).toEqual(players);
      expect(mockPrisma.topScorerPrediction.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          player1: 'Messi',
          player2: 'Ronaldo',
          player3: 'Neymar',
          player4: 'Mbappe',
          player5: 'Haaland',
        },
      });
    });

    it('deve lançar ConflictException se já existe', async () => {
      mockPrisma.topScorerPrediction.findUnique.mockResolvedValue(basePrediction);

      await expect(service.create('user-1', createDto)).rejects.toThrow(ConflictException);
    });

    it('deve lançar BadRequestException se prazo expirou', async () => {
      mockPrisma.topScorerPrediction.findUnique.mockResolvedValue(null);
      mockPrisma.systemConfig.findFirst.mockResolvedValue({ betDeadline: new Date('2020-01-01') });

      await expect(service.create('user-1', createDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('deve atualizar prediction existente', async () => {
      mockPrisma.topScorerPrediction.findUnique.mockResolvedValue(basePrediction);
      mockPrisma.systemConfig.findFirst.mockResolvedValue({ betDeadline: null });
      mockPrisma.topScorerPrediction.update.mockResolvedValue(basePrediction);

      const result = await service.update('user-1', createDto);
      expect(result.players).toEqual(players);
    });

    it('deve lançar NotFoundException se não existe', async () => {
      mockPrisma.topScorerPrediction.findUnique.mockResolvedValue(null);

      await expect(service.update('user-1', createDto)).rejects.toThrow(NotFoundException);
    });

    it('deve lançar BadRequestException se prazo expirou', async () => {
      mockPrisma.topScorerPrediction.findUnique.mockResolvedValue(basePrediction);
      mockPrisma.systemConfig.findFirst.mockResolvedValue({ betDeadline: new Date('2020-01-01') });

      await expect(service.update('user-1', createDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('deve remover prediction existente', async () => {
      mockPrisma.topScorerPrediction.findUnique.mockResolvedValue(basePrediction);
      mockPrisma.topScorerPrediction.delete.mockResolvedValue(basePrediction);

      const result = await service.remove('user-1');
      expect(result.message).toContain('removido');
    });

    it('deve lançar NotFoundException se não existe', async () => {
      mockPrisma.topScorerPrediction.findUnique.mockResolvedValue(null);

      await expect(service.remove('user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('deve retornar todas as predictions formatadas', async () => {
      mockPrisma.topScorerPrediction.findMany.mockResolvedValue([basePrediction]);

      const result = await service.findAll();
      expect(result).toHaveLength(1);
      expect(result[0].players).toEqual(players);
      expect(result[0].user).toBeDefined();
    });
  });
});
