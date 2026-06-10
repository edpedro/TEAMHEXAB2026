import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../common/prisma.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: any;

  const mockPrisma = {
    notification: {
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByUser', () => {
    it('deve retornar notificações do usuário ordenadas por data desc', async () => {
      const notifications = [
        { id: '1', userId: 'user-1', title: 'Teste', message: 'msg', read: false, createdAt: new Date() },
      ];
      mockPrisma.notification.findMany.mockResolvedValue(notifications);

      const result = await service.findByUser('user-1');
      expect(result).toEqual(notifications);
      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    });
  });

  describe('getUnreadCount', () => {
    it('deve retornar contagem de não lidas', async () => {
      mockPrisma.notification.count.mockResolvedValue(3);

      const result = await service.getUnreadCount('user-1');
      expect(result).toBe(3);
      expect(mockPrisma.notification.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', read: false },
      });
    });
  });

  describe('markAsRead', () => {
    it('deve marcar notificação como lida', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.markAsRead('notif-1', 'user-1');
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'notif-1', userId: 'user-1' },
        data: { read: true },
      });
    });
  });

  describe('markAllAsRead', () => {
    it('deve marcar todas como lidas', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 5 });

      await service.markAllAsRead('user-1');
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', read: false },
        data: { read: true },
      });
    });
  });

  describe('create', () => {
    it('deve criar notificação', async () => {
      const notif = { id: '1', userId: 'user-1', title: 'Título', message: 'Mensagem', read: false };
      mockPrisma.notification.create.mockResolvedValue(notif);

      const result = await service.create('user-1', 'Título', 'Mensagem');
      expect(result).toEqual(notif);
      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', title: 'Título', message: 'Mensagem' },
      });
    });
  });

  describe('createForAllUsers', () => {
    it('deve criar notificação para todos os usuários ativos', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'u1' },
        { id: 'u2' },
        { id: 'u3' },
      ]);
      mockPrisma.notification.createMany.mockResolvedValue({ count: 3 });

      const result = await service.createForAllUsers('Aviso', 'Mensagem geral');
      expect(result.count).toBe(3);
      expect(mockPrisma.notification.createMany).toHaveBeenCalledWith({
        data: [
          { userId: 'u1', title: 'Aviso', message: 'Mensagem geral' },
          { userId: 'u2', title: 'Aviso', message: 'Mensagem geral' },
          { userId: 'u3', title: 'Aviso', message: 'Mensagem geral' },
        ],
      });
    });
  });
});
