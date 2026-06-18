import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FootballApiService } from './football-api.service';
import { PrismaService } from '../common/prisma.service';
import { ScoringService } from '../admin/scoring.service';
import { MatchesGateway } from '../matches/matches.gateway';
import { MatchStatus } from '@prisma/client';

describe('FootballApiService', () => {
  let service: FootballApiService;
  let prisma: any;

  const mockPrisma = {
    match: {
      count: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    prediction: {
      count: jest.fn(),
    },
    user: {
      count: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      if (key === 'WORLDCUP_API_URL') return 'https://worldcup26.ir';
      return defaultValue;
    }),
  };

  const mockScoringService = {
    calculateAndDistributePoints: jest.fn(),
  };

  const mockMatchesGateway = {
    emitMatchUpdate: jest.fn(),
    emitMatchesBatchUpdate: jest.fn(),
    emitLiveStatus: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FootballApiService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ScoringService, useValue: mockScoringService },
        { provide: MatchesGateway, useValue: mockMatchesGateway },
      ],
    }).compile();

    service = module.get<FootballApiService>(FootballApiService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('parseLocalDate', () => {
    it('deve retornar null se dateStr vazio', () => {
      const result = (service as any).parseLocalDate('');
      expect(result).toBeNull();
    });

    it('deve retornar null se dateStr null', () => {
      const result = (service as any).parseLocalDate(null);
      expect(result).toBeNull();
    });

    it('deve fazer parse de data no formato MM/DD/YYYY HH:MM', () => {
      const result = (service as any).parseLocalDate('06/15/2026 21:00');
      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBe(Date.UTC(2026, 5, 15, 21, 0));
    });

    it('deve usar venueUtcOffsetHours quando fornecido (UTC-6)', () => {
      const result = (service as any).parseLocalDate('06/15/2026 15:00', -6);
      expect(result.getTime()).toBe(Date.UTC(2026, 5, 15, 21, 0));
    });

    it('deve usar venueUtcOffsetHours quando fornecido (UTC+3)', () => {
      const result = (service as any).parseLocalDate('06/15/2026 12:00', 3);
      expect(result.getTime()).toBe(Date.UTC(2026, 5, 15, 9, 0));
    });

    it('deve usar fallback UTC quando venueUtcOffsetHours é undefined', () => {
      const result = (service as any).parseLocalDate('06/15/2026 21:00', undefined);
      expect(result.getTime()).toBe(Date.UTC(2026, 5, 15, 21, 0));
    });
  });

  describe('parsePhase', () => {
    it('deve mapear group para Fase de Grupos', () => {
      expect((service as any).parsePhase('group')).toBe('Fase de Grupos');
    });

    it('deve mapear r16 para Oitavas de final', () => {
      expect((service as any).parsePhase('r16')).toBe('Oitavas de final');
    });

    it('deve mapear qf para Quartas de final', () => {
      expect((service as any).parsePhase('qf')).toBe('Quartas de final');
    });

    it('deve mapear sf para Semifinais', () => {
      expect((service as any).parsePhase('sf')).toBe('Semifinais');
    });

    it('deve mapear final para Final', () => {
      expect((service as any).parsePhase('final')).toBe('Final');
    });

    it('deve mapear third para Terceiro Lugar', () => {
      expect((service as any).parsePhase('third')).toBe('Terceiro Lugar');
    });

    it('deve retornar o próprio valor se não mapeado', () => {
      expect((service as any).parsePhase('unknown')).toBe('unknown');
    });
  });

  describe('parseScore', () => {
    it('deve retornar 0 para null', () => {
      expect((service as any).parseScore(null)).toBe(0);
    });

    it('deve retornar 0 para undefined', () => {
      expect((service as any).parseScore(undefined)).toBe(0);
    });

    it('deve retornar número quando string numérica', () => {
      expect((service as any).parseScore('3')).toBe(3);
    });

    it('deve retornar 0 para string não numérica', () => {
      expect((service as any).parseScore('abc')).toBe(0);
    });
  });

  describe('syncAll — proteção de partidas FINISHED', () => {
    it('não deve atualizar matchDate de partida FINISHED', async () => {
      const existingMatch = {
        id: 'm1',
        teamHome: 'Brasil',
        teamAway: 'Argentina',
        matchDate: new Date(Date.UTC(2026, 5, 15, 21, 0)),
        phase: 'Fase de Grupos',
        status: MatchStatus.FINISHED,
        homeScore: 2,
        awayScore: 1,
      };

      mockPrisma.match.count.mockResolvedValue(1);

      (service as any).http = {
        get: jest.fn().mockResolvedValue({
          data: {
            teams: [],
            games: [{
              id: '1',
              home_team_id: '1',
              away_team_id: '2',
              home_team_name_en: 'Brazil',
              away_team_name_en: 'Argentina',
              home_team_label: 'Brazil',
              away_team_label: 'Argentina',
              home_score: '2',
              away_score: '1',
              local_date: '06/15/2026 18:00',
              stadium_id: '1',
              type: 'group',
              group: 'G',
              finished: 'TRUE',
            }],
            stadiums: [],
            groups: [],
          },
        }),
      };

      mockPrisma.match.findFirst.mockResolvedValue(existingMatch);

      await service.syncAll();

      expect(mockPrisma.match.update).not.toHaveBeenCalled();
    });

    it('deve atualizar matchDate de partida SCHEDULED', async () => {
      const existingMatch = {
        id: 'm1',
        teamHome: 'Brasil',
        teamAway: 'Argentina',
        matchDate: new Date(Date.UTC(2026, 5, 10, 21, 0)),
        phase: 'Fase de Grupos',
        status: MatchStatus.SCHEDULED,
        homeScore: null,
        awayScore: null,
      };

      mockPrisma.match.count.mockResolvedValue(1);
      mockPrisma.match.update.mockResolvedValue({ ...existingMatch, matchDate: new Date(Date.UTC(2026, 5, 15, 21, 0)) });

      (service as any).http = {
        get: jest.fn().mockResolvedValue({
          data: {
            teams: [],
            games: [{
              id: '1',
              home_team_id: '1',
              away_team_id: '2',
              home_team_name_en: 'Brazil',
              away_team_name_en: 'Argentina',
              home_team_label: 'Brazil',
              away_team_label: 'Argentina',
              home_score: null,
              away_score: null,
              local_date: '06/15/2026 18:00',
              stadium_id: '1',
              type: 'group',
              group: 'G',
              finished: 'FALSE',
            }],
            stadiums: [],
            groups: [],
          },
        }),
      };

      mockPrisma.match.findFirst.mockResolvedValue(existingMatch);

      await service.syncAll();

      expect(mockPrisma.match.update).toHaveBeenCalled();
    });
  });

  describe('CRON — lock de execução', () => {
    it('deve ignorar handleCronResults se isSyncing true', async () => {
      (service as any).isSyncing = true;

      const spy = jest.spyOn(service as any, 'syncResults');
      await service.handleCronResults();
      expect(spy).not.toHaveBeenCalled();
    });

    it('deve ignorar handleCronFullSync se isSyncing true', async () => {
      (service as any).isSyncing = true;

      const spy = jest.spyOn(service as any, 'syncAll');
      await service.handleCronFullSync();
      expect(spy).not.toHaveBeenCalled();
    });

    it('deve definir isSyncing true durante execução e false após', async () => {
      (service as any).isSyncing = false;
      jest.spyOn(service as any, 'syncAll').mockResolvedValue({ teams: 0, matches: 0, stadiums: 0, groups: 0 });

      const promise = service.handleCronFullSync();

      expect((service as any).isSyncing).toBe(true);

      await promise;
      expect((service as any).isSyncing).toBe(false);
    });
  });

  describe('mapStatus', () => {
    it('deve retornar FINISHED se finished for TRUE', () => {
      const result = (service as any).mapStatus('TRUE', new Date());
      expect(result).toBe(MatchStatus.FINISHED);
    });

    it('deve retornar IN_PROGRESS se data passou', () => {
      const result = (service as any).mapStatus('FALSE', new Date(Date.now() - 3600000));
      expect(result).toBe(MatchStatus.IN_PROGRESS);
    });

    it('deve retornar SCHEDULED se data no futuro', () => {
      const future = new Date(Date.now() + 86400000);
      const result = (service as any).mapStatus('FALSE', future);
      expect(result).toBe(MatchStatus.SCHEDULED);
    });
  });

  describe('onModuleInit', () => {
    it('não deve chamar syncAll se banco já populado', async () => {
      mockPrisma.match.count.mockResolvedValue(10);
      const spy = jest.spyOn(service, 'syncAll').mockResolvedValue({ teams: 0, matches: 0, stadiums: 0, groups: 0 });

      await service.onModuleInit();
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
