import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../common/prisma.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: any;

  const mockPrisma = {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const baseUser = {
    id: '1',
    fullName: 'João Silva',
    username: 'joao',
    role: 'USER',
    isActive: true,
    hasPaid: false,
    createdAt: new Date(),
  };

  describe('findAll', () => {
    it('deve retornar todos os usuários ordenados por createdAt desc', async () => {
      const users = [
        { ...baseUser, id: '2', createdAt: new Date('2026-06-02') },
        { ...baseUser, id: '1', createdAt: new Date('2026-06-01') },
      ];
      mockPrisma.user.findMany.mockResolvedValue(users);

      const result = await service.findAll();
      expect(result).toEqual(users);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        select: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findById', () => {
    it('deve retornar usuário quando encontrado', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        _count: { predictions: 5, userAchievements: 2 },
      });

      const result = await service.findById('1');
      expect(result).toBeDefined();
      expect(result.id).toBe('1');
      expect(result._count.predictions).toBe(5);
    });

    it('deve lançar NotFoundException quando usuário não existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.findById('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('togglePayment', () => {
    it('deve marcar como pago quando estava pendente', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, hasPaid: false });
      mockPrisma.user.update.mockResolvedValue({ ...baseUser, hasPaid: true, paidAt: new Date() });

      const result = await service.togglePayment('1');
      expect(result.hasPaid).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { hasPaid: true, paidAt: expect.any(Date) },
        select: expect.any(Object),
      });
    });

    it('deve marcar como pendente quando estava pago', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, hasPaid: true, paidAt: new Date() });
      mockPrisma.user.update.mockResolvedValue({ ...baseUser, hasPaid: false, paidAt: null });

      const result = await service.togglePayment('1');
      expect(result.hasPaid).toBe(false);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { hasPaid: false, paidAt: null },
        select: expect.any(Object),
      });
    });

    it('deve lançar NotFoundException se usuário não existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.togglePayment('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('toggleActive', () => {
    it('deve desativar usuário ativo', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, isActive: true });
      mockPrisma.user.update.mockResolvedValue({ ...baseUser, isActive: false });

      const result = await service.toggleActive('1');
      expect(result.isActive).toBe(false);
    });

    it('deve ativar usuário inativo', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, isActive: false });
      mockPrisma.user.update.mockResolvedValue({ ...baseUser, isActive: true });

      const result = await service.toggleActive('1');
      expect(result.isActive).toBe(true);
    });
  });

  describe('updateMyName', () => {
    it('deve atualizar o nome do usuário', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      mockPrisma.user.update.mockResolvedValue({ ...baseUser, fullName: 'Novo Nome' });

      const result = await service.updateMyName('1', 'Novo Nome');
      expect(result.fullName).toBe('Novo Nome');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { fullName: 'Novo Nome' },
        select: expect.any(Object),
      });
    });

    it('deve lançar NotFoundException se usuário não existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.updateMyName('999', 'Teste')).rejects.toThrow(NotFoundException);
    });
  });

  describe('changeRole', () => {
    it('deve alterar role do usuário', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, role: 'USER' });
      mockPrisma.user.update.mockResolvedValue({ ...baseUser, role: 'ADMIN' });

      const result = await service.changeRole('1', 'ADMIN', 'admin-id');
      expect(result.role).toBe('ADMIN');
    });

    it('não deve permitir remover o último admin', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, role: 'ADMIN' });
      mockPrisma.user.count.mockResolvedValue(1);

      await expect(service.changeRole('1', 'USER', 'admin-id')).rejects.toThrow(BadRequestException);
    });

    it('deve permitir remover admin se houver outro admin', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, role: 'ADMIN' });
      mockPrisma.user.count.mockResolvedValue(2);
      mockPrisma.user.update.mockResolvedValue({ ...baseUser, role: 'USER' });

      const result = await service.changeRole('1', 'USER', 'admin-id');
      expect(result.role).toBe('USER');
    });

    it('não deve permitir auto-demote', async () => {
      await expect(service.changeRole('1', 'USER', '1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('deve deletar usuário existente', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      mockPrisma.user.delete.mockResolvedValue(baseUser);

      const result = await service.remove('1');
      expect(result.message).toBe('Usuário removido com sucesso');
    });

    it('deve lançar NotFoundException se usuário não existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.remove('999')).rejects.toThrow(NotFoundException);
    });
  });
});
