import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ScoringService } from '../admin/scoring.service';
import { PrismaService } from '../common/prisma.service';
import { GamificationService } from '../gamification/gamification.service';
import { RankingGateway } from '../ranking/ranking.gateway';
import { RankingService } from '../ranking/ranking.service';
import { MatchesGateway } from '../matches/matches.gateway';
import { WhatsappService } from './whatsapp.service';

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,qrcode'),
}));

jest.mock('whatsapp-web.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    initialize: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn().mockResolvedValue(undefined),
    getState: jest.fn().mockResolvedValue('CONNECTED'),
    sendMessage: jest.fn().mockResolvedValue(true),
    getChats: jest.fn().mockResolvedValue([]),
    info: { wid: { user: '5511999999999' }, pushname: 'Test' },
  })),
  LocalAuth: jest.fn().mockImplementation(() => ({})),
}));

const JUL_1_2026 = 6;

function brtUtc(year: number, month: number, day: number, hours: number, minutes: number = 0, seconds: number = 0): Date {
  return new Date(Date.UTC(year, month, day, hours + 3, minutes, seconds));
}

describe('Notificações WhatsApp — Virada de Meia-Noite', () => {

  // ==========================================================================
  // PARTE 1: WhatsappService — Notificação de Fechamento (handlePredictionClosingCheck)
  // ==========================================================================

  describe('WhatsappService.handlePredictionClosingCheck', () => {
    let service: WhatsappService;
    let prisma: any;

    const mockConfig = { get: jest.fn(() => undefined) };

    async function createService() {
      jest.clearAllMocks();
      jest.useFakeTimers();

      const basePrisma = {
        whatsAppGroup: {
          findFirst: jest.fn().mockResolvedValue({ groupId: 'g1', groupName: 'Grupo Teste' }),
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
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          WhatsappService,
          { provide: ConfigService, useValue: mockConfig },
          { provide: PrismaService, useValue: basePrisma },
        ],
      }).compile();

      service = module.get<WhatsappService>(WhatsappService);
      prisma = basePrisma;
    }

    afterEach(() => {
      jest.useRealTimers();
    });

    // -----------------------------------------------------------------------
    // Cenário 1: Jogo inicia 22:00 (01/07) — notificação 21:25 (mesmo dia)
    // -----------------------------------------------------------------------
    it('[Cenário 1] deve enviar notificação de fechamento para jogo às 22:00 dentro do mesmo dia BRT', async () => {
      await createService();
      jest.setSystemTime(brtUtc(2026, JUL_1_2026, 1, 21, 25));
      const matchDate = brtUtc(2026, JUL_1_2026, 1, 22, 0);

      prisma.match.findMany.mockResolvedValue([{
        id: 'm1', teamHome: 'Brasil', teamAway: 'Argentina',
        teamHomeIso: 'BR', teamAwayIso: 'AR', matchDate, status: 'SCHEDULED',
      }]);
      prisma.whatsAppNotification.findFirst.mockResolvedValue(null);

      const sendSpy = jest.spyOn(service as any, 'sendPredictionClosingNotification').mockResolvedValue(true);

      await service.handlePredictionClosingCheck();

      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(sendSpy).toHaveBeenCalledWith('Brasil', 'Argentina', matchDate, 'BR', 'AR');
      expect(prisma.whatsAppNotification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'prediction_closing', matchId: 'm1', success: true }),
        }),
      );
    });

    it('[Cenário 1] não deve enviar notificação antes da janela de 5min (21:10)', async () => {
      await createService();
      jest.setSystemTime(brtUtc(2026, JUL_1_2026, 1, 21, 10));
      prisma.match.findMany.mockResolvedValue([{
        id: 'm1', teamHome: 'Brasil', teamAway: 'Argentina',
        teamHomeIso: 'BR', teamAwayIso: 'AR',
        matchDate: brtUtc(2026, JUL_1_2026, 1, 22, 0), status: 'SCHEDULED',
      }]);

      const sendSpy = jest.spyOn(service as any, 'sendPredictionClosingNotification').mockResolvedValue(true);
      await service.handlePredictionClosingCheck();
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('[Cenário 1] não deve enviar notificação após o bloqueio (21:35)', async () => {
      await createService();
      jest.setSystemTime(brtUtc(2026, JUL_1_2026, 1, 21, 35));
      prisma.match.findMany.mockResolvedValue([{
        id: 'm1', teamHome: 'Brasil', teamAway: 'Argentina',
        teamHomeIso: 'BR', teamAwayIso: 'AR',
        matchDate: brtUtc(2026, JUL_1_2026, 1, 22, 0), status: 'SCHEDULED',
      }]);

      const sendSpy = jest.spyOn(service as any, 'sendPredictionClosingNotification').mockResolvedValue(true);
      await service.handlePredictionClosingCheck();
      expect(sendSpy).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // Cenário 2: Jogo começa à meia-noite (00:00 02/07)
    //            Notificação deveria ser às 23:25 do dia anterior (01/07)
    // -----------------------------------------------------------------------
    it('[Cenário 2] calcula lockDeadline como 23:30 do dia anterior para jogo à meia-noite', () => {
      const matchDate = brtUtc(2026, JUL_1_2026, 2, 0, 0);
      const lockDeadline = new Date(matchDate.getTime() - 30 * 60 * 1000);
      expect(lockDeadline.getUTCHours()).toBe(2);
      expect(lockDeadline.getUTCMinutes()).toBe(30);
    });

    it('[Cenário 2] BUG: não encontra jogo à meia-noite porque getTodayBrtRange limita ao dia atual', async () => {
      await createService();
      jest.setSystemTime(brtUtc(2026, JUL_1_2026, 1, 23, 25));
      const matchDate = brtUtc(2026, JUL_1_2026, 2, 0, 0);

      const range = (service as any).getTodayBrtRange();
      expect(matchDate.getTime()).toBeGreaterThan(range.end.getTime());

      prisma.match.findMany.mockResolvedValue([]);
      prisma.whatsAppNotification.findFirst.mockResolvedValue(null);

      const sendSpy = jest.spyOn(service as any, 'sendPredictionClosingNotification').mockResolvedValue(true);
      await service.handlePredictionClosingCheck();
      expect(sendSpy).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // Deduplicação
    // -----------------------------------------------------------------------
    it('não deve enviar notificação duplicada (dedup)', async () => {
      await createService();
      jest.setSystemTime(brtUtc(2026, JUL_1_2026, 1, 21, 25));
      prisma.match.findMany.mockResolvedValue([{
        id: 'm1', teamHome: 'TimeA', teamAway: 'TimeB',
        matchDate: brtUtc(2026, JUL_1_2026, 1, 22, 0), status: 'SCHEDULED',
      }]);
      prisma.whatsAppNotification.findFirst.mockResolvedValue({ id: 'n1' });

      const sendSpy = jest.spyOn(service as any, 'sendPredictionClosingNotification').mockResolvedValue(true);
      await service.handlePredictionClosingCheck();
      expect(sendSpy).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // Fuso Horário
    // -----------------------------------------------------------------------
    it('funciona para jogo às 01:00 BRT (madrugada)', async () => {
      await createService();
      jest.setSystemTime(brtUtc(2026, JUL_1_2026, 2, 0, 25));
      const matchDate = brtUtc(2026, JUL_1_2026, 2, 1, 0);

      prisma.match.findMany.mockResolvedValue([{
        id: 'm1', teamHome: 'Brasil', teamAway: 'Argentina',
        teamHomeIso: 'BR', teamAwayIso: 'AR', matchDate, status: 'SCHEDULED',
      }]);
      prisma.whatsAppNotification.findFirst.mockResolvedValue(null);

      const sendSpy = jest.spyOn(service as any, 'sendPredictionClosingNotification').mockResolvedValue(true);
      await service.handlePredictionClosingCheck();
      expect(sendSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // PARTE 2: ScoringService — Notificação de Partida Finalizada
  // ==========================================================================

  describe('ScoringService.sendWhatsAppNotifications (partida finalizada)', () => {
    let scoringService: ScoringService;
    let whatsappServiceMock: any;

    async function createScoringService() {
      jest.clearAllMocks();
      jest.useFakeTimers();

      const prisma = {
        match: { findUnique: jest.fn() },
        prediction: { findMany: jest.fn(), update: jest.fn() },
        user: { findMany: jest.fn(), count: jest.fn() },
        systemConfig: { findFirst: jest.fn() },
      };

      const gmMock = { checkAndAwardAchievements: jest.fn() };
      const rgMock = { emitRankingUpdate: jest.fn() };
      const rsMock = { getRanking: jest.fn() };
      const mgMock = { emitMatchUpdate: jest.fn(), emitMatchesBatchUpdate: jest.fn(), emitLiveStatus: jest.fn() };
      whatsappServiceMock = {
        hasNotificationBeenSent: jest.fn(),
        sendMatchFinishedNotification: jest.fn().mockResolvedValue(true),
        sendRankingNotification: jest.fn(),
        recordNotification: jest.fn(),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ScoringService,
          { provide: PrismaService, useValue: prisma },
          { provide: GamificationService, useValue: gmMock },
          { provide: RankingGateway, useValue: rgMock },
          { provide: RankingService, useValue: rsMock },
          { provide: MatchesGateway, useValue: mgMock },
          { provide: WhatsappService, useValue: whatsappServiceMock },
        ],
      }).compile();

      scoringService = module.get<ScoringService>(ScoringService);
    }

    afterEach(() => {
      jest.useRealTimers();
    });

    // -----------------------------------------------------------------------
    // Cenário 1: Jogo inicia 22:00 (01/07) e termina 00:05 (02/07)
    // -----------------------------------------------------------------------
    it('[Cenário 1] BUG: não envia notificação quando matchDate é do dia anterior', async () => {
      await createScoringService();
      jest.setSystemTime(brtUtc(2026, JUL_1_2026, 2, 0, 5));

      const match = {
        id: 'm1', teamHome: 'Brasil', teamAway: 'Argentina',
        teamHomeIso: 'BR', teamAwayIso: 'AR',
        homeScore: 2, awayScore: 1,
        matchDate: brtUtc(2026, JUL_1_2026, 1, 22, 0),
        status: 'FINISHED' as const, flagHome: null, flagAway: null,
      };

      whatsappServiceMock.hasNotificationBeenSent.mockResolvedValue(false);
      await (scoringService as any).sendWhatsAppNotifications(match, [], []);
      expect(whatsappServiceMock.sendMatchFinishedNotification).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // Cenário 2: Jogo começa à meia-noite (00:00 02/07) e termina 02:00
    // -----------------------------------------------------------------------
    it('[Cenário 2] envia notificação para jogo que começou e terminou no mesmo dia', async () => {
      await createScoringService();
      jest.setSystemTime(brtUtc(2026, JUL_1_2026, 2, 2, 0));

      const match = {
        id: 'm2', teamHome: 'Brasil', teamAway: 'Argentina',
        teamHomeIso: 'BR', teamAwayIso: 'AR',
        homeScore: 3, awayScore: 0,
        matchDate: brtUtc(2026, JUL_1_2026, 2, 0, 0),
        status: 'FINISHED' as const, flagHome: null, flagAway: null,
      };

      whatsappServiceMock.hasNotificationBeenSent.mockResolvedValue(false);
      await (scoringService as any).sendWhatsAppNotifications(match, [], []);

      expect(whatsappServiceMock.sendMatchFinishedNotification).toHaveBeenCalledTimes(1);
      expect(whatsappServiceMock.recordNotification).toHaveBeenCalledWith('match_finished', 'm2', true);
    });

    // -----------------------------------------------------------------------
    // Validações obrigatórias
    // -----------------------------------------------------------------------
    it('não envia se jogo não está FINISHED', async () => {
      await createScoringService();
      jest.setSystemTime(brtUtc(2026, JUL_1_2026, 2, 0, 5));
      await (scoringService as any).sendWhatsAppNotifications({
        id: 'm1', teamHome: 'A', teamAway: 'B',
        homeScore: 2, awayScore: 1,
        matchDate: brtUtc(2026, JUL_1_2026, 2, 0, 0),
        status: 'IN_PROGRESS' as const,
        teamHomeIso: null, teamAwayIso: null, flagHome: null, flagAway: null,
      }, [], []);
      expect(whatsappServiceMock.sendMatchFinishedNotification).not.toHaveBeenCalled();
    });

    it('não envia se homeScore ou awayScore for null', async () => {
      await createScoringService();
      jest.setSystemTime(brtUtc(2026, JUL_1_2026, 2, 0, 5));
      await (scoringService as any).sendWhatsAppNotifications({
        id: 'm1', teamHome: 'A', teamAway: 'B',
        homeScore: null, awayScore: null,
        matchDate: brtUtc(2026, JUL_1_2026, 2, 0, 0),
        status: 'FINISHED' as const,
        teamHomeIso: null, teamAwayIso: null, flagHome: null, flagAway: null,
      }, [], []);
      expect(whatsappServiceMock.sendMatchFinishedNotification).not.toHaveBeenCalled();
    });

    it('não envia notificação duplicada (dedup)', async () => {
      await createScoringService();
      jest.setSystemTime(brtUtc(2026, JUL_1_2026, 2, 2, 0));
      whatsappServiceMock.hasNotificationBeenSent.mockResolvedValue(true);
      await (scoringService as any).sendWhatsAppNotifications({
        id: 'm1', teamHome: 'A', teamAway: 'B',
        homeScore: 1, awayScore: 0, teamHomeIso: null, teamAwayIso: null,
        matchDate: brtUtc(2026, JUL_1_2026, 2, 0, 0),
        status: 'FINISHED' as const, flagHome: null, flagAway: null,
      }, [], []);
      expect(whatsappServiceMock.sendMatchFinishedNotification).not.toHaveBeenCalled();
    });

    it('inclui top 5 do ranking com palpites na notificação', async () => {
      await createScoringService();
      jest.setSystemTime(brtUtc(2026, JUL_1_2026, 2, 2, 0));

      const match = {
        id: 'm1', teamHome: 'Brasil', teamAway: 'Argentina',
        homeScore: 2, awayScore: 1, teamHomeIso: 'BR', teamAwayIso: 'AR',
        matchDate: brtUtc(2026, JUL_1_2026, 2, 0, 0),
        status: 'FINISHED' as const, flagHome: null, flagAway: null,
      };

      const predictions: any[] = [
        { id: 'p1', userId: 'u1', predictedHome: 2, predictedAway: 1, pointsEarned: 5, createdAt: new Date(), user: { fullName: 'João' } },
        { id: 'p2', userId: 'u2', predictedHome: 1, predictedAway: 0, pointsEarned: 3, createdAt: new Date(), user: { fullName: 'Maria' } },
      ];

      const ranking: any[] = [
        { id: 'u1', fullName: 'João', position: 1, score: 100 },
        { id: 'u2', fullName: 'Maria', position: 2, score: 80 },
        { id: 'u3', fullName: 'Carlos', position: 3, score: 60 },
      ];

      whatsappServiceMock.hasNotificationBeenSent.mockResolvedValue(false);
      await (scoringService as any).sendWhatsAppNotifications(match, predictions, ranking);

      expect(whatsappServiceMock.sendMatchFinishedNotification).toHaveBeenCalledWith(
        'Brasil', 'Argentina', 2, 1,
        [
          expect.objectContaining({ userName: 'João', pointsEarned: 5 }),
          expect.objectContaining({ userName: 'Maria', pointsEarned: 3 }),
          expect.objectContaining({ userName: 'Carlos', pointsEarned: null }),
        ],
        'BR', 'AR',
      );
    });

    // -----------------------------------------------------------------------
    // Testes de Fuso Horário
    // -----------------------------------------------------------------------
    it('usa timestamp (DateTime), não data (YYYY-MM-DD), para comparações', () => {
      const d1 = brtUtc(2026, JUL_1_2026, 1, 23, 59, 59);
      const d2 = brtUtc(2026, JUL_1_2026, 2, 0, 0, 0);
      expect(d2.getTime() - d1.getTime()).toBe(1000);

      const str1 = d1.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      const str2 = d2.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      expect(str1).not.toBe(str2);
    });

    it('funciona em qualquer horário de madrugada (00:00-05:00 BRT)', async () => {
      await createScoringService();
      for (const hora of [0, 1, 2, 3, 4, 5]) {
        jest.setSystemTime(brtUtc(2026, JUL_1_2026, 2, hora, 30));
        const match = {
          id: `m-${hora}`, teamHome: 'A', teamAway: 'B',
          homeScore: 1, awayScore: 0, teamHomeIso: null, teamAwayIso: null,
          matchDate: brtUtc(2026, JUL_1_2026, 2, hora, 0),
          status: 'FINISHED' as const, flagHome: null, flagAway: null,
        };
        whatsappServiceMock.hasNotificationBeenSent.mockReset();
        whatsappServiceMock.sendMatchFinishedNotification.mockReset();
        whatsappServiceMock.recordNotification.mockReset();
        whatsappServiceMock.hasNotificationBeenSent.mockResolvedValue(false);

        await (scoringService as any).sendWhatsAppNotifications(match, [], []);
        expect(whatsappServiceMock.sendMatchFinishedNotification).toHaveBeenCalledTimes(1);
      }
    });

    it('MATCH_DURATION_MS cruza meia-noite corretamente', () => {
      const MATCH_DURATION_MS = 135 * 60 * 1000;
      const matchStart = brtUtc(2026, JUL_1_2026, 1, 22, 0);
      const matchEnd = new Date(matchStart.getTime() + MATCH_DURATION_MS);

      const brtEndDate = matchEnd.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      expect(brtEndDate).toBe('2026-07-02');
      expect(matchEnd.getTime() - matchStart.getTime()).toBe(MATCH_DURATION_MS);
    });
  });

  // ==========================================================================
  // PARTE 3: Validação de detecção de partidas na virada (timestamp vs data)
  // ==========================================================================

  describe('Detecção de partidas na virada de meia-noite (timestamp vs data)', () => {
    it('detecta partida na janela de tempo usando timestamp, não data', () => {
      const MATCH_DURATION_MS = 135 * 60 * 1000;
      const matchStart = brtUtc(2026, JUL_1_2026, 1, 22, 0).getTime();
      const now = brtUtc(2026, JUL_1_2026, 2, 0, 30).getTime();

      const isInWindow = now >= matchStart && now <= matchStart + MATCH_DURATION_MS;
      expect(isInWindow).toBe(false);
    });

    it('detecta partida ainda ativa 30min após virada de meia-noite', () => {
      const MATCH_DURATION_MS = 135 * 60 * 1000;
      const matchStart = brtUtc(2026, JUL_1_2026, 1, 23, 0).getTime();
      const now = brtUtc(2026, JUL_1_2026, 2, 0, 30).getTime();

      const isInWindow = now >= matchStart && now <= matchStart + MATCH_DURATION_MS;
      expect(isInWindow).toBe(true);
    });

    it('marca como FINISHED apenas após matchDate + MATCH_DURATION_MS', () => {
      const MATCH_DURATION_MS = 135 * 60 * 1000;
      const matchTs = brtUtc(2026, JUL_1_2026, 1, 23, 0).getTime();

      const after = brtUtc(2026, JUL_1_2026, 2, 1, 30).getTime();
      const before = brtUtc(2026, JUL_1_2026, 2, 0, 30).getTime();

      expect(after > matchTs + MATCH_DURATION_MS).toBe(true);
      expect(before > matchTs + MATCH_DURATION_MS).toBe(false);
    });
  });

  // ==========================================================================
  // PARTE 4: Logs de diagnóstico
  // ==========================================================================

  describe('Logs de diagnóstico', () => {
    let service: WhatsappService;
    let prisma: any;

    const mockConfig = { get: jest.fn(() => undefined) };

    beforeEach(async () => {
      jest.useFakeTimers();
      jest.clearAllMocks();

      prisma = {
        whatsAppGroup: {
          findFirst: jest.fn(), findMany: jest.fn(), updateMany: jest.fn(), update: jest.fn(), upsert: jest.fn(),
        },
        whatsAppNotification: { create: jest.fn(), findFirst: jest.fn() },
        match: { findMany: jest.fn() },
      };

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

    it('deve logar quantidade de partidas verificadas', async () => {
      jest.setSystemTime(brtUtc(2026, JUL_1_2026, 1, 21, 25));
      prisma.whatsAppGroup.findFirst.mockResolvedValue({ groupId: 'g1', groupName: 'Grupo Teste' });
      prisma.match.findMany.mockResolvedValue([]);

      const logSpy = jest.spyOn(service['logger'], 'log');
      await service.handlePredictionClosingCheck();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('0 partida(s) hoje'));
    });

    it('deve logar diferença em minutos para bloqueio', async () => {
      jest.setSystemTime(brtUtc(2026, JUL_1_2026, 1, 21, 25));
      prisma.whatsAppGroup.findFirst.mockResolvedValue({ groupId: 'g1', groupName: 'Grupo Teste' });
      prisma.match.findMany.mockResolvedValue([{
        id: 'm1', teamHome: 'Brasil', teamAway: 'Argentina',
        matchDate: brtUtc(2026, JUL_1_2026, 1, 22, 0), status: 'SCHEDULED',
      }]);

      jest.spyOn(service as any, 'sendPredictionClosingNotification').mockResolvedValue(true);
      prisma.whatsAppNotification.findFirst.mockResolvedValue(null);

      const logSpy = jest.spyOn(service['logger'], 'log');
      await service.handlePredictionClosingCheck();

      const logs = logSpy.mock.calls.map(c => c[0]).join(' ');
      expect(logs).toContain('Brasil');
      expect(logs).toContain('Diferença para bloqueio');
    });
  });
});
