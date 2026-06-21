import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WhatsappService } from './whatsapp.service';
import { PrismaService } from '../common/prisma.service';

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,qrcode'),
}));

var mockInitialize = jest.fn().mockResolvedValue(undefined);
var mockOn = jest.fn();
var mockSendMessage = jest.fn().mockResolvedValue(true);
var mockDestroy = jest.fn().mockResolvedValue(undefined);
var mockGetState = jest.fn().mockResolvedValue('CONNECTED');
var mockGetChats = jest.fn().mockResolvedValue([
  { isGroup: true, name: 'Grupo Teste', id: { _serialized: 'group-id-1' }, participants: [{ id: 'p1' }] },
]);

jest.mock('whatsapp-web.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    on: mockOn,
    initialize: mockInitialize,
    destroy: mockDestroy,
    getState: mockGetState,
    sendMessage: mockSendMessage,
    getChats: mockGetChats,
    info: { wid: { user: '5511999999999' }, pushname: 'Test User' },
  })),
  LocalAuth: jest.fn().mockImplementation(() => ({})),
}));

const { Client } = jest.requireMock('whatsapp-web.js');

describe('WhatsappService', () => {
  let service: WhatsappService;
  let prisma: any;

  const mockConfig = {
    get: jest.fn((key: string) => {
      if (key === 'PUPPETEER_EXECUTABLE_PATH') return undefined;
      return undefined;
    }),
  };

  const mockPrisma = () => ({
    whatsAppGroup: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    whatsAppNotification: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    match: {
      findMany: jest.fn(),
    },
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = mockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<WhatsappService>(WhatsappService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // --- getStatus ---
  describe('getStatus', () => {
    it('deve retornar DISCONNECTED por padrão', () => {
      const status = service.getStatus();
      expect(status.status).toBe('DISCONNECTED');
      expect(status.qrCode).toBeNull();
      expect(status.info).toBeNull();
    });
  });

  // --- getQrCode ---
  describe('getQrCode', () => {
    it('deve retornar null quando não há QR', async () => {
      const qr = await service.getQrCode();
      expect(qr).toBeNull();
    });
  });

  // --- connect / disconnect ---
  describe('connect', () => {
    it('deve criar Client e chamar initialize', async () => {
      await service.connect();
      expect(Client).toHaveBeenCalledTimes(1);
      const client = Client.mock.results[0].value;
      expect(client.initialize).toHaveBeenCalledTimes(1);
    });

    it('deve ignorar chamada se client já existe', async () => {
      await service.connect();
      await service.connect();
      expect(Client).toHaveBeenCalledTimes(1);
    });

    it('deve capturar erro de inicialização sem lançar exceção', async () => {
      mockInitialize.mockRejectedValueOnce(new Error('Falha na inicialização'));
      await service.connect();
      expect(service.getStatus().status).toBe('DISCONNECTED');
    });
  });

  describe('disconnect', () => {
    it('deve destruir client e marcar DISCONNECTED', async () => {
      await service.connect();
      const client = Client.mock.results[0].value;
      await service.disconnect();
      expect(client.destroy).toHaveBeenCalledTimes(1);
      expect(service.getStatus().status).toBe('DISCONNECTED');
    });
  });

  // --- sendToGroup ---
  describe('sendToGroup', () => {
    it('deve retornar false se nenhum grupo ativo', async () => {
      prisma.whatsAppGroup.findFirst.mockResolvedValue(null);
      const result = await (service as any).sendToGroup('teste');
      expect(result).toBe(false);
    });

    it('deve retornar false se WhatsApp não conectado', async () => {
      prisma.whatsAppGroup.findFirst.mockResolvedValue({
        groupId: 'group-id-1',
        groupName: 'Grupo Teste',
      });
      const result = await (service as any).sendToGroup('teste');
      expect(result).toBe(false);
    });

    it('deve enviar mensagem com sucesso', async () => {
      prisma.whatsAppGroup.findFirst.mockResolvedValue({
        groupId: 'group-id-1',
        groupName: 'Grupo Teste',
      });
      await service.connect();
      const client = Client.mock.results[0].value;
      client.sendMessage.mockResolvedValueOnce(true);

      const result = await (service as any).sendToGroup('mensagem de teste');
      expect(result).toBe(true);
      expect(client.sendMessage).toHaveBeenCalledWith('group-id-1', expect.stringContaining('mensagem de teste'));
    });

    it('deve adicionar footer Robô', async () => {
      prisma.whatsAppGroup.findFirst.mockResolvedValue({
        groupId: 'group-id-1',
        groupName: 'Grupo Teste',
      });
      await service.connect();
      const client = Client.mock.results[0].value;
      client.sendMessage.mockResolvedValueOnce(true);

      await (service as any).sendToGroup('teste');
      expect(client.sendMessage).toHaveBeenCalledWith('group-id-1', expect.stringContaining('🤖 Robô'));
    });

    it('deve fazer retry 1x após falha e logar detalhes', async () => {
      jest.useFakeTimers();
      prisma.whatsAppGroup.findFirst.mockResolvedValue({
        groupId: 'group-id-1',
        groupName: 'Grupo Teste',
      });
      const loggerSpy = jest.spyOn(service['logger'], 'warn');
      const loggerErrorSpy = jest.spyOn(service['logger'], 'error');

      await service.connect();
      const client = Client.mock.results[0].value;
      client.sendMessage
        .mockRejectedValueOnce(new Error('Falha de rede'))
        .mockResolvedValueOnce(true);

      const promise = (service as any).sendToGroup('teste');
      await jest.advanceTimersByTimeAsync(3000);

      const result = await promise;
      expect(result).toBe(true);
      expect(client.sendMessage).toHaveBeenCalledTimes(2);
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Falha ao enviar mensagem para grupo "Grupo Teste"'),
      );
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    it('deve retornar false se ambas tentativas falharem', async () => {
      jest.useFakeTimers();
      prisma.whatsAppGroup.findFirst.mockResolvedValue({
        groupId: 'group-id-1',
        groupName: 'Grupo Teste',
      });
      const loggerErrorSpy = jest.spyOn(service['logger'], 'error');

      await service.connect();
      const client = Client.mock.results[0].value;
      client.sendMessage
        .mockRejectedValueOnce(new Error('Falha de rede'))
        .mockRejectedValueOnce(new Error('Falha persistente'));

      const promise = (service as any).sendToGroup('teste');
      await jest.advanceTimersByTimeAsync(3000);

      const result = await promise;
      expect(result).toBe(false);
      expect(client.sendMessage).toHaveBeenCalledTimes(2);
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Grupo Teste'),
      );
    });
  });

  // --- sendTestMessage ---
  describe('sendTestMessage', () => {
    it('deve usar mensagem padrão se nenhuma fornecida', async () => {
      const spy = jest.spyOn(service as any, 'sendToGroup').mockResolvedValue(true);
      await service.sendTestMessage();
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Mensagem de teste'));
    });

    it('deve usar mensagem personalizada', async () => {
      const spy = jest.spyOn(service as any, 'sendToGroup').mockResolvedValue(true);
      await service.sendTestMessage('Minha mensagem');
      expect(spy).toHaveBeenCalledWith('Minha mensagem');
    });
  });

  // --- sendPredictionClosingNotification ---
  describe('sendPredictionClosingNotification', () => {
    it('deve formatar mensagem corretamente e enviar', async () => {
      const spy = jest.spyOn(service as any, 'sendToGroup').mockResolvedValue(true);
      const matchDate = new Date('2026-06-25T21:00:00-03:00');

      const result = await service.sendPredictionClosingNotification('Brasil', 'Argentina', matchDate);

      expect(result).toBe(true);
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('Brasil x Argentina'),
      );
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('21:00'),
      );
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('⚽ Atenção, participantes!'),
      );
    });

    it('não deve lançar exceção se sendToGroup falhar', async () => {
      jest.spyOn(service as any, 'sendToGroup').mockResolvedValue(false);
      const matchDate = new Date();

      const result = await service.sendPredictionClosingNotification('Time A', 'Time B', matchDate);
      expect(result).toBe(false);
    });
  });

  // --- sendMatchFinishedNotification ---
  describe('sendMatchFinishedNotification', () => {
    it('deve formatar resultado e palpites corretamente', async () => {
      const spy = jest.spyOn(service as any, 'sendToGroup').mockResolvedValue(true);
      const predictions = [
        { userName: 'João', predictedHome: 2, predictedAway: 1, pointsEarned: 5 },
        { userName: 'Maria', predictedHome: 1, predictedAway: 1, pointsEarned: 3 },
        { userName: 'Pedro', predictedHome: 0, predictedAway: 2, pointsEarned: 0 },
      ];

      const result = await service.sendMatchFinishedNotification('Brasil', 'Argentina', 2, 1, predictions);

      expect(result).toBe(true);
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('Brasil 2 x 1 Argentina'),
      );
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('🥇'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('5 pts'));
    });

    it('deve ordenar por pontos (maior primeiro)', async () => {
      const spy = jest.spyOn(service as any, 'sendToGroup').mockResolvedValue(true);
      const predictions = [
        { userName: 'Pedro', predictedHome: 0, predictedAway: 2, pointsEarned: 0 },
        { userName: 'João', predictedHome: 2, predictedAway: 1, pointsEarned: 5 },
        { userName: 'Maria', predictedHome: 1, predictedAway: 1, pointsEarned: 3 },
      ];

      await service.sendMatchFinishedNotification('Brasil', 'Argentina', 2, 1, predictions);

      const sentMessage = spy.mock.calls[0][0] as string;
      const joaoPos = sentMessage.indexOf('João');
      const mariaPos = sentMessage.indexOf('Maria');
      const pedroPos = sentMessage.indexOf('Pedro');
      expect(joaoPos).toBeLessThan(mariaPos);
      expect(mariaPos).toBeLessThan(pedroPos);
    });

    it('deve usar createdAt como desempate quando pontos são iguais', async () => {
      const spy = jest.spyOn(service as any, 'sendToGroup').mockResolvedValue(true);
      const predictions = [
        { userName: 'João', predictedHome: 2, predictedAway: 1, pointsEarned: 5, createdAt: new Date('2026-06-20T10:00:00') },
        { userName: 'Maria', predictedHome: 1, predictedAway: 0, pointsEarned: 5, createdAt: new Date('2026-06-20T09:00:00') },
      ];

      await service.sendMatchFinishedNotification('Brasil', 'Argentina', 2, 1, predictions);

      const sentMessage = spy.mock.calls[0][0] as string;
      const mariaPos = sentMessage.indexOf('Maria');
      const joaoPos = sentMessage.indexOf('João');
      expect(mariaPos).toBeLessThan(joaoPos);
    });

    it('deve exibir apenas top 3', async () => {
      const spy = jest.spyOn(service as any, 'sendToGroup').mockResolvedValue(true);
      const predictions = Array.from({ length: 10 }, (_, i) => ({
        userName: `User${i}`, predictedHome: 1, predictedAway: 0, pointsEarned: i,
      }));

      await service.sendMatchFinishedNotification('Brasil', 'Argentina', 1, 0, predictions);

      const sentMessage = spy.mock.calls[0][0] as string;
      expect(sentMessage).toContain('🥇');
      expect(sentMessage).toContain('🥈');
      expect(sentMessage).toContain('🥉');
      expect(sentMessage).not.toContain('User6');
    });

    it('deve exibir mensagem se não houver palpites', async () => {
      const spy = jest.spyOn(service as any, 'sendToGroup').mockResolvedValue(true);

      await service.sendMatchFinishedNotification('Brasil', 'Argentina', 1, 0, []);

      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Nenhum palpite registrado'));
    });

    it('deve funcionar com menos de 3 participantes', async () => {
      const spy = jest.spyOn(service as any, 'sendToGroup').mockResolvedValue(true);
      const predictions = [
        { userName: 'João', predictedHome: 2, predictedAway: 1, pointsEarned: 5 },
      ];

      await service.sendMatchFinishedNotification('Brasil', 'Argentina', 2, 1, predictions);

      const sentMessage = spy.mock.calls[0][0] as string;
      expect(sentMessage).toContain('🥇');
      expect(sentMessage).not.toContain('🥈');
    });

    it('deve exibir medalhas corretas', async () => {
      const spy = jest.spyOn(service as any, 'sendToGroup').mockResolvedValue(true);
      const predictions = [
        { userName: 'A', predictedHome: 1, predictedAway: 0, pointsEarned: 5 },
        { userName: 'B', predictedHome: 0, predictedAway: 0, pointsEarned: 3 },
        { userName: 'C', predictedHome: 2, predictedAway: 2, pointsEarned: 0 },
      ];

      await service.sendMatchFinishedNotification('Brasil', 'Argentina', 1, 0, predictions);

      const sentMessage = spy.mock.calls[0][0] as string;
      expect(sentMessage).toContain('🥇 A');
      expect(sentMessage).toContain('🥈 B');
      expect(sentMessage).toContain('🥉 C');
    });
  });

  // --- sendRankingNotification ---
  describe('sendRankingNotification', () => {
    it('deve retornar false se ranking vazio', async () => {
      const result = await service.sendRankingNotification([]);
      expect(result).toBe(false);
    });

    it('deve exibir top 5 com medalhas', async () => {
      const spy = jest.spyOn(service as any, 'sendToGroup').mockResolvedValue(true);
      const ranking = [
        { position: 1, userName: 'João', score: 100 },
        { position: 2, userName: 'Maria', score: 80 },
        { position: 3, userName: 'Pedro', score: 60 },
        { position: 4, userName: 'Ana', score: 40 },
        { position: 5, userName: 'Lucas', score: 20 },
      ];

      await service.sendRankingNotification(ranking);

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('🥇 1º João — 100 pontos'),
      );
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('🥈 2º Maria — 80 pontos'),
      );
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('🥉 3º Pedro — 60 pontos'),
      );
    });

    it('deve exibir apenas quantidade disponível se < 5', async () => {
      const spy = jest.spyOn(service as any, 'sendToGroup').mockResolvedValue(true);
      const ranking = [
        { position: 1, userName: 'João', score: 10 },
        { position: 2, userName: 'Maria', score: 5 },
      ];

      await service.sendRankingNotification(ranking);

      expect(spy).toHaveBeenCalledTimes(1);
      const msg = spy.mock.calls[0][0];
      expect(msg).toContain('1º');
      expect(msg).toContain('2º');
      expect(msg).not.toContain('3º');
    });
  });

  // --- hasNotificationBeenSent ---
  describe('hasNotificationBeenSent', () => {
    it('deve retornar true se notificação existe', async () => {
      prisma.whatsAppNotification.findFirst.mockResolvedValue({ id: 'n1' });
      const result = await service.hasNotificationBeenSent('match_finished', 'match-1');
      expect(result).toBe(true);
    });

    it('deve retornar false se notificação não existe', async () => {
      prisma.whatsAppNotification.findFirst.mockResolvedValue(null);
      const result = await service.hasNotificationBeenSent('match_finished', 'match-1');
      expect(result).toBe(false);
    });
  });

  // --- recordNotification ---
  describe('recordNotification', () => {
    it('deve criar registro no banco', async () => {
      await service.recordNotification('match_finished', 'match-1', true);
      expect(prisma.whatsAppNotification.create).toHaveBeenCalledWith({
        data: { type: 'match_finished', matchId: 'match-1', success: true, error: undefined },
      });
    });

    it('deve registrar erro quando fornecido', async () => {
      await service.recordNotification('match_finished', 'match-1', false, 'Erro de rede');
      expect(prisma.whatsAppNotification.create).toHaveBeenCalledWith({
        data: { type: 'match_finished', matchId: 'match-1', success: false, error: 'Erro de rede' },
      });
    });
  });

  // --- getMedal ---
  describe('getMedal', () => {
    it('deve retornar 🥇 para posição 0', () => {
      expect((service as any).getMedal(0)).toBe('🥇');
    });

    it('deve retornar 🥈 para posição 1', () => {
      expect((service as any).getMedal(1)).toBe('🥈');
    });

    it('deve retornar 🥉 para posição 2', () => {
      expect((service as any).getMedal(2)).toBe('🥉');
    });

    it('deve retornar 🏅 para posições > 2', () => {
      expect((service as any).getMedal(3)).toBe('🏅');
      expect((service as any).getMedal(10)).toBe('🏅');
    });
  });

  // --- getActiveGroup ---
  describe('getActiveGroup', () => {
    it('deve retornar grupo ativo', async () => {
      prisma.whatsAppGroup.findFirst.mockResolvedValue({
        groupId: 'g1',
        groupName: 'Grupo Teste',
      });
      const group = await service.getActiveGroup();
      expect(group).toEqual({ groupId: 'g1', groupName: 'Grupo Teste' });
    });

    it('deve retornar null se nenhum grupo ativo', async () => {
      prisma.whatsAppGroup.findFirst.mockResolvedValue(null);
      const group = await service.getActiveGroup();
      expect(group).toBeNull();
    });
  });

  // --- checkAndSendClosingNotification ---
  describe('checkAndSendClosingNotification', () => {
    it('deve chamar sendPredictionClosingNotification e retornar true', async () => {
      const spy = jest.spyOn(service as any, 'sendPredictionClosingNotification').mockResolvedValue(true);
      const result = await service.checkAndSendClosingNotification('Brasil', 'Argentina', new Date());
      expect(result).toBe(true);
      expect(spy).toHaveBeenCalledWith('Brasil', 'Argentina', expect.any(Date));
    });

    it('deve chamar sendPredictionClosingNotification e retornar false se falhar', async () => {
      const spy = jest.spyOn(service as any, 'sendPredictionClosingNotification').mockResolvedValue(false);
      const result = await service.checkAndSendClosingNotification('Brasil', 'Argentina', new Date());
      expect(result).toBe(false);
    });
  });

  // --- handlePredictionClosingCheck (CRON) ---
  describe('handlePredictionClosingCheck', () => {
    it('deve retornar cedo se não houver grupo ativo', async () => {
      prisma.whatsAppGroup.findFirst.mockResolvedValue(null);
      const loggerSpy = jest.spyOn(service['logger'], 'warn');
      await service.handlePredictionClosingCheck();
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('nenhum grupo ativo'),
      );
    });

    it('deve encontrar match na janela e enviar notificação', async () => {
      prisma.whatsAppGroup.findFirst.mockResolvedValue({
        groupId: 'g1', groupName: 'Grupo Teste',
      });

      const matchDate = new Date(Date.now() + 32 * 60 * 1000);
      prisma.match.findMany.mockResolvedValue([
        {
          id: 'm1', teamHome: 'Brasil', teamAway: 'Argentina',
          matchDate,
          status: 'SCHEDULED',
        },
      ]);

      prisma.whatsAppNotification.findFirst.mockResolvedValue(null);
      const sendSpy = jest.spyOn(service, 'sendPredictionClosingNotification' as any).mockResolvedValue(true);

      await service.handlePredictionClosingCheck();

      expect(sendSpy).toHaveBeenCalledWith('Brasil', 'Argentina', expect.any(Date));
    });

    it('deve ignorar match já notificada (dedup)', async () => {
      prisma.whatsAppGroup.findFirst.mockResolvedValue({
        groupId: 'g1', groupName: 'Grupo Teste',
      });

      const matchDate = new Date(Date.now() + 32 * 60 * 1000);
      prisma.match.findMany.mockResolvedValue([
        {
          id: 'm1', teamHome: 'Brasil', teamAway: 'Argentina',
          matchDate,
          status: 'SCHEDULED',
        },
      ]);

      prisma.whatsAppNotification.findFirst.mockResolvedValue({ id: 'n1' });
      const sendSpy = jest.spyOn(service, 'sendPredictionClosingNotification' as any);

      await service.handlePredictionClosingCheck();

      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('deve ignorar match fora da janela de notificação', async () => {
      prisma.whatsAppGroup.findFirst.mockResolvedValue({
        groupId: 'g1', groupName: 'Grupo Teste',
      });

      const matchDate = new Date(Date.now() + 60 * 60 * 1000);
      prisma.match.findMany.mockResolvedValue([
        {
          id: 'm1', teamHome: 'Brasil', teamAway: 'Argentina',
          matchDate,
          status: 'SCHEDULED',
        },
      ]);

      const sendSpy = jest.spyOn(service, 'sendPredictionClosingNotification' as any);

      await service.handlePredictionClosingCheck();

      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('deve registrar falha no envio', async () => {
      prisma.whatsAppGroup.findFirst.mockResolvedValue({
        groupId: 'g1', groupName: 'Grupo Teste',
      });

      const matchDate = new Date(Date.now() + 32 * 60 * 1000);
      prisma.match.findMany.mockResolvedValue([
        {
          id: 'm1', teamHome: 'Brasil', teamAway: 'Argentina',
          matchDate,
          status: 'SCHEDULED',
        },
      ]);

      prisma.whatsAppNotification.findFirst.mockResolvedValue(null);
      jest.spyOn(service, 'sendPredictionClosingNotification' as any).mockResolvedValue(false);

      await service.handlePredictionClosingCheck();

      expect(prisma.whatsAppNotification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'prediction_closing',
            matchId: 'm1',
            success: false,
            error: 'Falha ao enviar',
          }),
        }),
      );
    });
  });
});
