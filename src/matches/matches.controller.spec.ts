import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { MatchStatus } from '@prisma/client';

describe('MatchesController — Endpoints REST', () => {
  let app: INestApplication;
  let mockService: any;

  const mockMatch = {
    id: 'm1',
    teamHome: 'Brasil',
    teamAway: 'Argentina',
    teamHomeIso: 'br',
    teamAwayIso: 'ar',
    flagHome: 'https://flagcdn.com/w160/br.png',
    flagAway: 'https://flagcdn.com/w160/ar.png',
    matchDate: new Date('2026-06-15T21:00:00Z'),
    phase: 'Fase de Grupos',
    groupLabel: 'J',
    status: MatchStatus.SCHEDULED,
    homeScore: null,
    awayScore: null,
    stadium: 'Estádio MetLife',
    city: 'East Rutherford',
    country: 'Estados Unidos',
  };

  const mockLiveMatch = {
    ...mockMatch,
    id: 'm2',
    teamHome: 'México',
    teamAway: 'África do Sul',
    status: MatchStatus.IN_PROGRESS,
    homeScore: 1,
    awayScore: 0,
  };

  beforeEach(async () => {
    mockService = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      getUpcoming: jest.fn(),
      getRecentResults: jest.fn(),
      getTodayMatches: jest.fn(),
      getLiveMatches: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MatchesController],
      providers: [{ provide: MatchesService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── GET /api/matches/today ──────────────────────────────────

  describe('GET /api/matches/today', () => {
    it('deve retornar status 200 e um array de partidas do dia', async () => {
      const todayMatches = [
        { ...mockMatch, matchDate: new Date() },
        { ...mockLiveMatch, matchDate: new Date() },
      ];
      mockService.getTodayMatches.mockResolvedValue(todayMatches);

      const res = await request(app.getHttpServer())
        .get('/api/matches/today')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
      expect(mockService.getTodayMatches).toHaveBeenCalledTimes(1);
    });

    it('deve retornar array vazio se não houver partidas hoje', async () => {
      mockService.getTodayMatches.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get('/api/matches/today')
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('deve retornar partidas com a estrutura esperada', async () => {
      const match = {
        ...mockMatch,
        matchDate: new Date(),
      };
      mockService.getTodayMatches.mockResolvedValue([match]);

      const res = await request(app.getHttpServer())
        .get('/api/matches/today')
        .expect(200);

      const m = res.body[0];
      expect(m).toHaveProperty('id');
      expect(m).toHaveProperty('teamHome');
      expect(m).toHaveProperty('teamAway');
      expect(m).toHaveProperty('status');
      expect(m).toHaveProperty('matchDate');
      expect(m).toHaveProperty('homeScore');
      expect(m).toHaveProperty('awayScore');
    });
  });

  // ─── GET /api/matches/live ───────────────────────────────────

  describe('GET /api/matches/live', () => {
    it('deve retornar status 200 e array de partidas ao vivo', async () => {
      mockService.getLiveMatches.mockResolvedValue([mockLiveMatch]);

      const res = await request(app.getHttpServer())
        .get('/api/matches/live')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].status).toBe('IN_PROGRESS');
      expect(res.body[0].homeScore).toBe(1);
      expect(res.body[0].awayScore).toBe(0);
    });

    it('deve retornar array vazio se nenhum jogo ao vivo', async () => {
      mockService.getLiveMatches.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get('/api/matches/live')
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('deve listar apenas partidas com status IN_PROGRESS', async () => {
      mockService.getLiveMatches.mockResolvedValue([mockLiveMatch]);

      const res = await request(app.getHttpServer())
        .get('/api/matches/live')
        .expect(200);

      for (const match of res.body) {
        expect(match.status).toBe('IN_PROGRESS');
      }
    });
  });

  // ─── Autenticação ────────────────────────────────────────────

  it('deve permitir GET /today e GET /live sem token (público)', async () => {
    const rejectingGuard = { canActivate: () => false };

    const module2: TestingModule = await Test.createTestingModule({
      controllers: [MatchesController],
      providers: [{ provide: MatchesService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(rejectingGuard)
      .compile();

    const app2 = module2.createNestApplication();
    app2.setGlobalPrefix('api');
    await app2.init();

    mockService.getTodayMatches.mockResolvedValue([]);
    mockService.getLiveMatches.mockResolvedValue([]);

    await request(app2.getHttpServer())
      .get('/api/matches/today')
      .expect(200);

    await request(app2.getHttpServer())
      .get('/api/matches/live')
      .expect(200);

    await app2.close();
  });

  it('deve bloquear GET /:id sem token JWT válido', async () => {
    const rejectingGuard = { canActivate: () => false };

    const module2: TestingModule = await Test.createTestingModule({
      controllers: [MatchesController],
      providers: [{ provide: MatchesService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(rejectingGuard)
      .compile();

    const app2 = module2.createNestApplication();
    app2.setGlobalPrefix('api');
    await app2.init();

    await request(app2.getHttpServer())
      .get('/api/matches/m1')
      .expect(403);

    await app2.close();
  });
});
