import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FootballApiService } from './football-api.service';
import { PrismaService } from '../common/prisma.service';
import { ScoringService } from '../admin/scoring.service';
import { MatchesGateway } from '../matches/matches.gateway';
import { MatchStatus } from '@prisma/client';

describe('Smart Polling — handleCronResults', () => {
  let service: FootballApiService;
  let prisma: any;
  let syncResultsSpy: jest.SpyInstance;

  const mockConfig = {
    get: jest.fn((key: string, def?: any) =>
      key === 'WORLDCUP_API_URL' ? 'https://worldcup26.ir' : def,
    ),
  };

  const mockScoring = { calculateAndDistributePoints: jest.fn() };
  const mockGateway = {
    emitMatchUpdate: jest.fn(),
    emitMatchesBatchUpdate: jest.fn(),
    emitLiveStatus: jest.fn(),
  };

  const mockPrisma = {
    match: { count: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    prediction: { count: jest.fn() },
    user: { count: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FootballApiService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ScoringService, useValue: mockScoring },
        { provide: MatchesGateway, useValue: mockGateway },
      ],
    }).compile();

    service = module.get<FootballApiService>(FootballApiService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.spyOn(service as any, 'fetchMatches').mockResolvedValue([]);
    syncResultsSpy = jest.spyOn(service as any, 'syncResults').mockResolvedValue(0);

    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-15T12:00:00Z'));
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  // ─── R01: Lock de execução ─────────────────────────────────

  it('deve ignorar se isSyncing for true', async () => {
    (service as any).isSyncing = true;
    (service as any).lastResultsSync = new Date(Date.now() - 180_000);

    await (service as any).handleCronResults();

    expect(syncResultsSpy).not.toHaveBeenCalled();
  });

  // ─── R02: Mínimo de 60s entre chamadas ──────────────────────

  it('deve ignorar se menos de 60s desde o último sync', async () => {
    (service as any).isSyncing = false;
    (service as any).lastResultsSync = new Date(Date.now() - 30_000);

    await (service as any).handleCronResults();

    expect(syncResultsSpy).not.toHaveBeenCalled();
  });

  // ─── R03: Live mode — hasLiveMatches + >= 120s ──────────────

  it('deve sincronizar se há jogos ao vivo e passaram 120s', async () => {
    (service as any).isSyncing = false;
    (service as any).lastResultsSync = new Date(Date.now() - 180_000);
    mockPrisma.match.count.mockResolvedValue(2);

    await (service as any).handleCronResults();

    expect(syncResultsSpy).toHaveBeenCalledTimes(1);
  });

  // ─── R04: Live mode — hasLiveMatches mas < 120s ─────────────

  it('não deve sincronizar se há jogos ao vivo mas não passaram 120s', async () => {
    (service as any).isSyncing = false;
    (service as any).lastResultsSync = new Date(Date.now() - 60_000);
    mockPrisma.match.count
      .mockResolvedValueOnce(2)  // liveCount
      .mockResolvedValueOnce(0); // nearMatch

    await (service as any).handleCronResults();

    expect(syncResultsSpy).not.toHaveBeenCalled();
  });

  // ─── R05: Idle mode — sem live, < 1800s ─────────────────────

  it('não deve sincronizar se não há jogos ao vivo e menos de 30min do último sync', async () => {
    (service as any).isSyncing = false;
    (service as any).lastResultsSync = new Date(Date.now() - 120_000);
    mockPrisma.match.count
      .mockResolvedValueOnce(0)  // liveCount
      .mockResolvedValueOnce(0); // nearMatch

    await (service as any).handleCronResults();

    expect(syncResultsSpy).not.toHaveBeenCalled();
  });

  // ─── R06: Idle mode — 30min sem live → sync automático ──

  it('deve sincronizar se 30min ocioso (idle automático)', async () => {
    (service as any).isSyncing = false;
    (service as any).lastResultsSync = new Date(Date.now() - 1_900_000);
    mockPrisma.match.count
      .mockResolvedValueOnce(0)  // liveCount
      .mockResolvedValueOnce(0); // nearMatch

    await (service as any).handleCronResults();

    expect(syncResultsSpy).toHaveBeenCalledTimes(1);
  });

  // ─── R07: Near match — jogo na janela de tempo ──

  it('deve sincronizar se há jogo na janela de tempo (nearMatch)', async () => {
    (service as any).isSyncing = false;
    (service as any).lastResultsSync = new Date(Date.now() - 120_000);
    mockPrisma.match.count
      .mockResolvedValueOnce(0)  // liveCount
      .mockResolvedValueOnce(1); // nearMatch (jogo na janela)

    await (service as any).handleCronResults();

    expect(syncResultsSpy).toHaveBeenCalledTimes(1);
  });

  // ─── R08: Idle — 30min sem live, sem jogos na janela ─────────

  it('não deve sincronizar se sem live, sem nearMatch e <30min idle', async () => {
    (service as any).isSyncing = false;
    (service as any).lastResultsSync = new Date(Date.now() - 120_000);
    mockPrisma.match.count
      .mockResolvedValueOnce(0)  // liveCount
      .mockResolvedValueOnce(0); // nearMatch

    await (service as any).handleCronResults();

    expect(syncResultsSpy).not.toHaveBeenCalled();
  });

  // ─── R09: Backoff — falha na API ajusta lastResultsSync ──────

  it('deve aplicar backoff exponencial em caso de falha na API', async () => {
    (service as any).isSyncing = false;
    (service as any).lastResultsSync = new Date(Date.now() - 180_000);
    (service as any).consecutiveFailures = 0;
    mockPrisma.match.count
      .mockResolvedValueOnce(2)  // liveCount
      .mockResolvedValueOnce(0); // nearMatch

    // Simula falha no syncResults
    syncResultsSpy.mockRejectedValue(new Error('API timeout'));

    const errorSpy = jest.spyOn(service['logger'], 'error').mockImplementation(() => {});

    await (service as any).handleCronResults();

    // consecutiveFailures deve ter incrementado para 1
    expect((service as any).consecutiveFailures).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('API falhou (1x consecutiva)'),
    );

    // Segunda falha — backoff de 2min
    syncResultsSpy.mockRejectedValue(new Error('API timeout'));
    (service as any).lastResultsSync = new Date(Date.now() - 180_000);
    await (service as any).handleCronResults();
    expect((service as any).consecutiveFailures).toBe(2);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('API falhou (2x consecutiva)'),
    );

    // Terceira falha — backoff de 3min
    syncResultsSpy.mockRejectedValue(new Error('API timeout'));
    (service as any).lastResultsSync = new Date(Date.now() - 180_000);
    await (service as any).handleCronResults();
    expect((service as any).consecutiveFailures).toBe(3);

    // Sétima falha — cap no backoff (max 6)
    for (let i = 4; i <= 7; i++) {
      syncResultsSpy.mockRejectedValue(new Error('API timeout'));
      (service as any).lastResultsSync = new Date(Date.now() - 180_000);
      await (service as any).handleCronResults();
    }
    // Cap atinge 6, não deve passar
    expect((service as any).consecutiveFailures).toBe(7);
    // Verifica que o backoffMs calculado = min(7,6) * 60000 = 360000
    // O lastResultsSync foi ajustado para now - 1800000 + 360000 = now - 1440000
    // Isso significa que o próximo sync será adiado em 24min (1440s)
  });

  // ─── R10: Sucesso após falha reseta consecutiveFailures ──────

  it('deve resetar consecutiveFailures para 0 após sync bem-sucedido', async () => {
    (service as any).isSyncing = false;
    (service as any).lastResultsSync = new Date(Date.now() - 180_000);
    (service as any).consecutiveFailures = 5;
    mockPrisma.match.count
      .mockResolvedValueOnce(2)  // liveCount
      .mockResolvedValueOnce(0); // nearMatch

    // Desta vez o syncResults tem sucesso
    syncResultsSpy.mockResolvedValue(2);

    await (service as any).handleCronResults();

    expect((service as any).consecutiveFailures).toBe(0);
    expect(syncResultsSpy).toHaveBeenCalledTimes(1);
  });

  // ─── R11: Flag isSyncing é resetada após execução ────────────

  it('deve resetar isSyncing para false mesmo em caso de erro', async () => {
    (service as any).isSyncing = false;
    (service as any).lastResultsSync = new Date(Date.now() - 180_000);
    mockPrisma.match.count
      .mockResolvedValueOnce(2)  // liveCount
      .mockResolvedValueOnce(0); // nearMatch
    syncResultsSpy.mockRejectedValue(new Error('Erro'));

    jest.spyOn(service['logger'], 'error').mockImplementation(() => {});

    await (service as any).handleCronResults();

    expect((service as any).isSyncing).toBe(false);
  });

  // ─── R12: Check de nearMatch ─────────────────────────────────

  it('deve sincronizar se nearMatch > 0 e passou 60s', async () => {
    (service as any).isSyncing = false;
    (service as any).lastResultsSync = new Date(Date.now() - 120_000);
    mockPrisma.match.count
      .mockResolvedValueOnce(0)  // liveCount
      .mockResolvedValueOnce(1); // nearMatch

    await (service as any).handleCronResults();

    expect(syncResultsSpy).toHaveBeenCalledTimes(1);
  });

  it('não deve sincronizar se nearMatch = 0 e menos de 30min idle', async () => {
    (service as any).isSyncing = false;
    (service as any).lastResultsSync = new Date(Date.now() - 120_000);
    mockPrisma.match.count
      .mockResolvedValueOnce(0)  // liveCount
      .mockResolvedValueOnce(0); // nearMatch

    await (service as any).handleCronResults();

    expect(syncResultsSpy).not.toHaveBeenCalled();
  });
});
