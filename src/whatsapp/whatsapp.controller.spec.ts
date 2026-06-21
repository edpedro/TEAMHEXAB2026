import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';

describe('WhatsappController', () => {
  let controller: WhatsappController;
  let service: WhatsappService;

  const mockService = {
    getStatus: jest.fn(),
    getQrCode: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    syncGroups: jest.fn(),
    setActiveGroup: jest.fn(),
    getActiveGroup: jest.fn(),
    sendTestMessage: jest.fn(),
    checkAndSendClosingNotification: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappController],
      providers: [
        { provide: WhatsappService, useValue: mockService },
      ],
    }).compile();

    controller = module.get<WhatsappController>(WhatsappController);
    service = module.get<WhatsappService>(WhatsappService);
  });

  describe('GET /admin/whatsapp/status', () => {
    it('deve retornar status e grupo ativo', async () => {
      mockService.getStatus.mockReturnValue({
        status: 'CONNECTED',
        qrCode: null,
        info: { phone: '5511999999999', name: 'Test' },
      });
      mockService.getActiveGroup.mockResolvedValue({
        groupId: 'g1',
        groupName: 'Grupo Teste',
      });

      const result = await controller.getStatus();
      expect(result).toEqual({
        status: 'CONNECTED',
        qrCode: null,
        info: { phone: '5511999999999', name: 'Test' },
        activeGroup: { groupId: 'g1', groupName: 'Grupo Teste' },
      });
    });

    it('deve retornar activeGroup null se não houver grupo', async () => {
      mockService.getStatus.mockReturnValue({ status: 'DISCONNECTED', qrCode: null, info: null });
      mockService.getActiveGroup.mockResolvedValue(null);

      const result = await controller.getStatus();
      expect(result.activeGroup).toBeNull();
    });
  });

  describe('GET /admin/whatsapp/qrcode', () => {
    it('deve retornar QR code', async () => {
      mockService.getQrCode.mockResolvedValue('data:image/png;base64,qrcode');
      const result = await controller.getQrCode();
      expect(result).toEqual({ qrCode: 'data:image/png;base64,qrcode' });
    });

    it('deve retornar qrCode null se não houver QR', async () => {
      mockService.getQrCode.mockResolvedValue(null);
      const result = await controller.getQrCode();
      expect(result).toEqual({ qrCode: null });
    });
  });

  describe('POST /admin/whatsapp/connect', () => {
    it('deve retornar mensagem se já conectado', async () => {
      mockService.getStatus.mockReturnValue({ status: 'CONNECTED' });
      const result = await controller.connect();
      expect(result).toEqual({ message: 'WhatsApp já está conectado' });
      expect(mockService.connect).not.toHaveBeenCalled();
    });

    it('deve iniciar conexão e retornar Conectando...', async () => {
      mockService.getStatus.mockReturnValue({ status: 'DISCONNECTED' });
      mockService.connect.mockResolvedValue(undefined);

      const result = await controller.connect();
      expect(result).toEqual({ message: 'Conectando...' });
      expect(mockService.connect).toHaveBeenCalledTimes(1);
    });

    it('deve capturar erro da conexão sem lançar', async () => {
      mockService.getStatus.mockReturnValue({ status: 'DISCONNECTED' });
      mockService.connect.mockRejectedValue(new Error('Falha'));

      const result = await controller.connect();
      expect(result).toEqual({ message: 'Conectando...' });
    });
  });

  describe('POST /admin/whatsapp/disconnect', () => {
    it('deve desconectar e retornar mensagem', async () => {
      mockService.disconnect.mockResolvedValue(undefined);
      const result = await controller.disconnect();
      expect(result).toEqual({ message: 'Desconectado' });
      expect(mockService.disconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /admin/whatsapp/groups', () => {
    it('deve retornar lista de grupos', async () => {
      mockService.syncGroups.mockResolvedValue([
        { id: 'g1', groupId: 'g1', groupName: 'Grupo A', participantCount: 10 },
      ]);
      const result = await controller.getGroups();
      expect(result).toEqual({
        groups: [{ id: 'g1', groupId: 'g1', groupName: 'Grupo A', participantCount: 10 }],
      });
    });

    it('deve retornar lista vazia se não houver grupos', async () => {
      mockService.syncGroups.mockResolvedValue([]);
      const result = await controller.getGroups();
      expect(result).toEqual({ groups: [] });
    });
  });

  describe('PUT /admin/whatsapp/group/:groupId', () => {
    it('deve definir grupo como ativo', async () => {
      mockService.setActiveGroup.mockResolvedValue(undefined);
      const result = await controller.setActiveGroup('group-id-1');
      expect(result).toEqual({ message: 'Grupo definido como ativo' });
      expect(mockService.setActiveGroup).toHaveBeenCalledWith('group-id-1');
    });
  });

  describe('POST /admin/whatsapp/test', () => {
    it('deve retornar sucesso se mensagem enviada', async () => {
      mockService.sendTestMessage.mockResolvedValue(true);
      const result = await controller.sendTest({ message: 'teste' });
      expect(result).toEqual({ message: 'Mensagem enviada com sucesso' });
    });

    it('deve retornar falha se envio falhar', async () => {
      mockService.sendTestMessage.mockResolvedValue(false);
      const result = await controller.sendTest({ message: 'teste' });
      expect(result).toEqual({ message: 'Falha ao enviar mensagem' });
    });

    it('deve enviar sem mensagem', async () => {
      mockService.sendTestMessage.mockResolvedValue(true);
      const result = await controller.sendTest({});
      expect(result).toEqual({ message: 'Mensagem enviada com sucesso' });
      expect(mockService.sendTestMessage).toHaveBeenCalledWith(undefined);
    });
  });

  describe('POST /admin/whatsapp/check-closing', () => {
    it('deve disparar notificação manual e retornar sucesso', async () => {
      mockService.checkAndSendClosingNotification.mockResolvedValue(true);
      const result = await controller.checkClosing({
        teamHome: 'Brasil',
        teamAway: 'Argentina',
        matchDate: '2026-06-25T21:00:00.000Z',
      });
      expect(result.sent).toBe(true);
      expect(result.message).toContain('Brasil x Argentina');
    });

    it('deve retornar falha se envio falhar', async () => {
      mockService.checkAndSendClosingNotification.mockResolvedValue(false);
      const result = await controller.checkClosing({
        teamHome: 'Brasil',
        teamAway: 'Argentina',
        matchDate: '2026-06-25T21:00:00.000Z',
      });
      expect(result.sent).toBe(false);
    });
  });
});
