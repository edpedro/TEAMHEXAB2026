import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import { PrismaService } from '../common/prisma.service';

describe('ReceiptsService', () => {
  let service: ReceiptsService;
  let prisma: any;

  const mockPrisma = {
    paymentReceipt: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      update: jest.fn(),
    },
  };

  const baseReceipt = {
    id: 'rec-1',
    userId: 'user-1',
    filePath: '/uploads/receipts/file.pdf',
    fileName: 'file.pdf',
    mimeType: 'application/pdf',
    status: 'PENDING',
    adminNotes: null,
    createdAt: new Date(),
    user: { id: 'user-1', fullName: 'João', username: 'joao' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceiptsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReceiptsService>(ReceiptsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('deve criar comprovante com status PENDING', async () => {
      const data = {
        userId: 'user-1',
        filePath: '/uploads/receipts/file.pdf',
        fileName: 'file.pdf',
        mimeType: 'application/pdf',
        notes: 'meu pagamento',
      };
      mockPrisma.paymentReceipt.create.mockResolvedValue(baseReceipt);

      const result = await service.create(data);
      expect(mockPrisma.paymentReceipt.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          filePath: '/uploads/receipts/file.pdf',
          fileName: 'file.pdf',
          mimeType: 'application/pdf',
          notes: 'meu pagamento',
          status: 'PENDING',
        },
      });
    });
  });

  describe('findByUser', () => {
    it('deve retornar comprovantes do usuário', async () => {
      mockPrisma.paymentReceipt.findMany.mockResolvedValue([baseReceipt]);

      const result = await service.findByUser('user-1');
      expect(result).toHaveLength(1);
      expect(mockPrisma.paymentReceipt.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findById', () => {
    it('deve retornar comprovante quando encontrado', async () => {
      mockPrisma.paymentReceipt.findUnique.mockResolvedValue(baseReceipt);

      const result = await service.findById('rec-1');
      expect(result.id).toBe('rec-1');
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.paymentReceipt.findUnique.mockResolvedValue(null);

      await expect(service.findById('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('deve retornar todos os comprovantes', async () => {
      mockPrisma.paymentReceipt.findMany.mockResolvedValue([baseReceipt]);

      const result = await service.findAll();
      expect(result).toHaveLength(1);
      expect(mockPrisma.paymentReceipt.findMany).toHaveBeenCalledWith({
        include: { user: { select: { id: true, fullName: true, username: true } } },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('approve', () => {
    it('deve aprovar comprovante e marcar usuário como pago', async () => {
      mockPrisma.paymentReceipt.findUnique
        .mockResolvedValueOnce(baseReceipt)
        .mockResolvedValueOnce({ ...baseReceipt, status: 'APPROVED' });
      mockPrisma.paymentReceipt.update.mockResolvedValue({ ...baseReceipt, status: 'APPROVED' });
      mockPrisma.user.update.mockResolvedValue({ id: 'user-1', hasPaid: true });

      const result = await service.approve('rec-1', 'ok');
      expect(result.status).toBe('APPROVED');
      expect(mockPrisma.paymentReceipt.update).toHaveBeenCalledWith({
        where: { id: 'rec-1' },
        data: { status: 'APPROVED', adminNotes: 'ok' },
      });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { hasPaid: true, paidAt: expect.any(Date) },
      });
    });
  });

  describe('reject', () => {
    it('deve rejeitar comprovante', async () => {
      mockPrisma.paymentReceipt.findUnique
        .mockResolvedValueOnce(baseReceipt)
        .mockResolvedValueOnce({ ...baseReceipt, status: 'REJECTED', adminNotes: 'recusado' });
      mockPrisma.paymentReceipt.update.mockResolvedValue({ ...baseReceipt, status: 'REJECTED', adminNotes: 'recusado' });

      const result = await service.reject('rec-1', 'recusado');
      expect(result.status).toBe('REJECTED');
      expect(mockPrisma.paymentReceipt.update).toHaveBeenCalledWith({
        where: { id: 'rec-1' },
        data: { status: 'REJECTED', adminNotes: 'recusado' },
      });
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });
});
