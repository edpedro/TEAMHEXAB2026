import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { AdminService } from './admin.service';
import { PrismaService } from '../common/prisma.service';
import { GamificationService } from '../gamification/gamification.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ScoringService } from './scoring.service';
import { RankingService } from '../ranking/ranking.service';
import { RankingGateway } from '../ranking/ranking.gateway';
import { ReceiptsService } from '../receipts/receipts.service';

describe('AdminService', () => {
  let service: AdminService;
  let prisma: any;
  let scoringService: any;
  let rankingService: any;
  let rankingGateway: any;
  let receiptsService: any;

  const mockPrisma = {
    user: {
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    prediction: {
      count: jest.fn(),
      updateMany: jest.fn(),
    },
    match: {
      count: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    systemConfig: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    paymentReceipt: {
      findMany: jest.fn(),
    },
  };

  const mockGamificationService = {};
  const mockNotificationsService = {};
  const mockScoringService = { calculateAndDistributePoints: jest.fn() };
  const mockRankingService = { getRanking: jest.fn().mockResolvedValue([]) };
  const mockRankingGateway = { emitRankingUpdate: jest.fn() };
  const mockReceiptsService = {
    findAll: jest.fn(),
    approve: jest.fn(),
    reject: jest.fn(),
  };

  const baseMatch = {
    id: 'match-1',
    teamHome: 'Brasil',
    teamAway: 'Argentina',
    matchDate: new Date('2026-06-15T21:00:00Z'),
    status: 'SCHEDULED',
    homeScore: null,
    awayScore: null,
    phase: 'Fase de Grupos',
    groupLabel: 'G',
  };

  const baseConfig = { id: 'cfg-1', betAmount: 20, pixKey: null, knockoutEnabled: false, bettingEnabled: true, betDeadline: null };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GamificationService, useValue: mockGamificationService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: ScoringService, useValue: mockScoringService },
        { provide: RankingService, useValue: mockRankingService },
        { provide: RankingGateway, useValue: mockRankingGateway },
        { provide: ReceiptsService, useValue: mockReceiptsService },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    prisma = module.get<PrismaService>(PrismaService);
    scoringService = module.get<ScoringService>(ScoringService);
    rankingService = module.get<RankingService>(RankingService);
    rankingGateway = module.get<RankingGateway>(RankingGateway);
    receiptsService = module.get<ReceiptsService>(ReceiptsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDashboard', () => {
    it('deve retornar dados do dashboard', async () => {
      mockPrisma.user.count.mockResolvedValueOnce(10);
      mockPrisma.prediction.count.mockResolvedValueOnce(50);
      mockPrisma.match.count.mockResolvedValueOnce(64);
      mockPrisma.match.count.mockResolvedValueOnce(30);
      mockPrisma.user.count.mockResolvedValueOnce(8);

      const result = await service.getDashboard();

      expect(result.activeUsers).toBe(10);
      expect(result.totalPredictions).toBe(50);
      expect(result.totalMatches).toBe(64);
      expect(result.finishedMatches).toBe(30);
      expect(result.paidUsers).toBe(8);
      expect(result.ranking).toEqual([]);
    });
  });

  describe('getFinancialDashboard', () => {
    it('deve retornar dados financeiros', async () => {
      mockPrisma.systemConfig.findFirst.mockResolvedValue(baseConfig);
      mockPrisma.user.count.mockResolvedValueOnce(10);
      mockPrisma.user.count.mockResolvedValueOnce(5);

      const result = await service.getFinancialDashboard();

      expect(result.betAmount).toBe(20);
      expect(result.paidUsers).toBe(10);
      expect(result.pendingUsers).toBe(5);
      expect(result.totalCollected).toBe(200);
      expect(result.prizePool).toBe(200);
    });

    it('deve usar betAmount padrão 20 se sem config', async () => {
      mockPrisma.systemConfig.findFirst.mockResolvedValue(null);
      mockPrisma.user.count.mockResolvedValue(0);

      const result = await service.getFinancialDashboard();
      expect(result.betAmount).toBe(20);
    });
  });

  describe('updateBetAmount', () => {
    it('deve atualizar valor da aposta', async () => {
      mockPrisma.systemConfig.findFirst.mockResolvedValue(baseConfig);
      mockPrisma.systemConfig.update.mockResolvedValue({ ...baseConfig, betAmount: 50 });

      const result = await service.updateBetAmount(50);
      expect(result.betAmount).toBe(50);
    });

    it('deve criar config se não existir', async () => {
      mockPrisma.systemConfig.findFirst.mockResolvedValue(null);
      mockPrisma.systemConfig.create.mockResolvedValue({ ...baseConfig, id: 'new', betAmount: 30 });

      await service.updateBetAmount(30);
      expect(mockPrisma.systemConfig.create).toHaveBeenCalledWith({ data: { betAmount: 30 } });
    });

    it('deve lançar BadRequestException se valor <= 0', async () => {
      await expect(service.updateBetAmount(0)).rejects.toThrow(BadRequestException);
      await expect(service.updateBetAmount(-5)).rejects.toThrow(BadRequestException);
    });
  });

  describe('updatePixKey', () => {
    it('deve atualizar chave PIX', async () => {
      mockPrisma.systemConfig.findFirst.mockResolvedValue(baseConfig);
      mockPrisma.systemConfig.update.mockResolvedValue({ ...baseConfig, pixKey: 'teste@pix.com' });

      const result = await service.updatePixKey('teste@pix.com');
      expect(result.pixKey).toBe('teste@pix.com');
    });

    it('deve criar config se não existir', async () => {
      mockPrisma.systemConfig.findFirst.mockResolvedValue(null);
      mockPrisma.systemConfig.create.mockResolvedValue({ ...baseConfig, id: 'new', pixKey: 'chave' });

      await service.updatePixKey('chave');
      expect(mockPrisma.systemConfig.create).toHaveBeenCalled();
    });

    it('deve lançar BadRequestException se chave vazia', async () => {
      await expect(service.updatePixKey('')).rejects.toThrow(BadRequestException);
      await expect(service.updatePixKey('   ')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getReceipts / approveReceipt / rejectReceipt', () => {
    it('getReceipts deve delegar para receiptsService', async () => {
      mockReceiptsService.findAll.mockResolvedValue([]);
      await service.getReceipts();
      expect(mockReceiptsService.findAll).toHaveBeenCalled();
    });

    it('approveReceipt deve delegar para receiptsService', async () => {
      mockReceiptsService.approve.mockResolvedValue({});
      await service.approveReceipt('rec-1', 'ok');
      expect(mockReceiptsService.approve).toHaveBeenCalledWith('rec-1', 'ok');
    });

    it('rejectReceipt deve delegar para receiptsService', async () => {
      mockReceiptsService.reject.mockResolvedValue({});
      await service.rejectReceipt('rec-1', 'recusado');
      expect(mockReceiptsService.reject).toHaveBeenCalledWith('rec-1', 'recusado');
    });
  });

  describe('setPassword', () => {
    it('deve alterar senha do usuário', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'joao', fullName: 'João' });
      mockPrisma.user.update.mockResolvedValue({ id: 'user-1', username: 'joao', fullName: 'João' });

      const result = await service.setPassword('user-1', 'nova-senha-123');
      expect(result.id).toBe('user-1');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: expect.any(String) },
        select: { id: true, username: true, fullName: true },
      });
    });

    it('deve lançar NotFoundException se usuário não existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.setPassword('999', 'senha')).rejects.toThrow(NotFoundException);
    });
  });

  describe('generateTempPassword', () => {
    it('deve gerar senha temporária', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.generateTempPassword('user-1');
      expect(result.tempPassword).toBeDefined();
      expect(result.tempPassword.length).toBe(4);
      expect(result.message).toContain('Senha temporária');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: expect.any(String), isTempPassword: true },
      });
    });

    it('deve lançar NotFoundException se usuário não existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.generateTempPassword('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('setResult', () => {
    it('deve atualizar resultado e chamar scoring', async () => {
      mockPrisma.match.findUnique.mockResolvedValue(baseMatch);
      mockPrisma.match.update.mockResolvedValue({ ...baseMatch, homeScore: 2, awayScore: 1, status: 'FINISHED' });

      const result = await service.setResult('match-1', 2, 1);
      expect(result.homeScore).toBe(2);
      expect(result.awayScore).toBe(1);
      expect(result.status).toBe('FINISHED');
      expect(mockScoringService.calculateAndDistributePoints).toHaveBeenCalledWith('match-1');
    });

    it('deve lançar BadRequestException se placar inválido', async () => {
      await expect(service.setResult('match-1', -1, 0)).rejects.toThrow(BadRequestException);
      await expect(service.setResult('match-1', 1.5, 0)).rejects.toThrow(BadRequestException);
    });

    it('deve lançar NotFoundException se partida não existe', async () => {
      mockPrisma.match.findUnique.mockResolvedValue(null);
      await expect(service.setResult('999', 1, 0)).rejects.toThrow(NotFoundException);
    });
  });

  describe('unlockKnockout', () => {
    it('deve atualizar config existente', async () => {
      mockPrisma.systemConfig.findFirst.mockResolvedValue(baseConfig);
      mockPrisma.systemConfig.update.mockResolvedValue({ ...baseConfig, knockoutEnabled: true });

      const result = await service.unlockKnockout();
      expect(result.knockoutEnabled).toBe(true);
    });

    it('deve criar config se não existir', async () => {
      mockPrisma.systemConfig.findFirst.mockResolvedValue(null);
      mockPrisma.systemConfig.create.mockResolvedValue({ ...baseConfig, id: 'new', knockoutEnabled: true });

      const result = await service.unlockKnockout();
      expect(result.knockoutEnabled).toBe(true);
    });
  });

  describe('getSystemConfig', () => {
    it('deve retornar config existente', async () => {
      mockPrisma.systemConfig.findFirst.mockResolvedValue(baseConfig);

      const result = await service.getSystemConfig();
      expect(result.betAmount).toBe(20);
    });

    it('deve criar config se não existir', async () => {
      mockPrisma.systemConfig.findFirst.mockResolvedValue(null);
      mockPrisma.systemConfig.create.mockResolvedValue({ ...baseConfig, id: 'new' });

      const result = await service.getSystemConfig();
      expect(result.betAmount).toBe(20);
    });
  });

  describe('updateSystemConfig', () => {
    it('deve atualizar config existente', async () => {
      mockPrisma.systemConfig.findFirst.mockResolvedValue(baseConfig);
      mockPrisma.systemConfig.update.mockResolvedValue({ ...baseConfig, bettingEnabled: false });

      const result = await service.updateSystemConfig({ bettingEnabled: false });
      expect(result.bettingEnabled).toBe(false);
    });

    it('deve criar config se não existir', async () => {
      mockPrisma.systemConfig.findFirst.mockResolvedValue(null);
      mockPrisma.systemConfig.create.mockResolvedValue({ ...baseConfig, id: 'new', knockoutEnabled: true });

      const result = await service.updateSystemConfig({ knockoutEnabled: true });
      expect(result.knockoutEnabled).toBe(true);
    });
  });

  describe('generateExcelTemplate', () => {
    it('deve gerar buffer XLSX válido', () => {
      const buffer = service.generateExcelTemplate();
      expect(buffer).toBeInstanceOf(Buffer);

      const wb = XLSX.read(buffer, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws);
      expect(rows).toHaveLength(1);
      expect(rows[0]['Seleção A']).toBe('Brasil');
      expect(rows[0]['Fase (opcional)']).toBe('Fase de Grupos');
      expect(rows[0]['Grupo (opcional)']).toBe('G');
    });
  });

  describe('processExcelUpload', () => {
    const createXlsxBuffer = (rows: any[]) => {
      const wb = XLSX.utils.book_new();
      const headers = ['Seleção A', 'Placar A', 'Seleção B', 'Placar B', 'Data (opcional)', 'Fase (opcional)', 'Grupo (opcional)'];
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows.map(r => [r.selA, r.golsA, r.selB, r.golsB, r.data || '', r.fase || '', r.grupo || ''])]);
      XLSX.utils.book_append_sheet(wb, ws, 'Partidas');
      return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    };

    it('deve atualizar placar da partida encontrada por data', async () => {
      const buffer = createXlsxBuffer([{ selA: 'Brasil', golsA: 2, selB: 'Sérvia', golsB: 0, data: '2026-06-15', fase: 'Fase de Grupos', grupo: 'G' }]);
      mockPrisma.match.findFirst.mockResolvedValue(baseMatch);
      mockPrisma.match.update.mockResolvedValue({ ...baseMatch, homeScore: 2, awayScore: 0, status: 'FINISHED' });

      const result = await service.processExcelUpload(buffer);
      expect(result.updated).toBe(1);
      expect(result.success).toBe(true);
    });

    it('deve usar fallback se data não encontrada', async () => {
      const buffer = createXlsxBuffer([{ selA: 'Brasil', golsA: 2, selB: 'Croácia', golsB: 1, data: '', fase: '', grupo: '' }]);
      mockPrisma.match.findFirst.mockResolvedValue(baseMatch);
      mockPrisma.match.update.mockResolvedValue({ ...baseMatch, homeScore: 2, awayScore: 1, status: 'FINISHED' });

      const result = await service.processExcelUpload(buffer);
      expect(result.updated).toBe(1);
    });

    it('deve incluir fase/grupo na busca quando fornecidos', async () => {
      const buffer = createXlsxBuffer([{ selA: 'Brasil', golsA: 2, selB: 'Argentina', golsB: 1, data: '', fase: 'Fase de Grupos', grupo: 'G' }]);
      mockPrisma.match.findFirst.mockResolvedValue(baseMatch);
      mockPrisma.match.update.mockResolvedValue({ ...baseMatch, homeScore: 2, awayScore: 1, status: 'FINISHED' });

      await service.processExcelUpload(buffer);
      expect(mockPrisma.match.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            phase: 'Fase de Grupos',
            groupLabel: 'G',
          }),
        }),
      );
    });

    it('deve reportar erro se Seleção vazia', async () => {
      const buffer = createXlsxBuffer([{ selA: '', golsA: 2, selB: 'Sérvia', golsB: 0, data: '', fase: '', grupo: '' }]);

      const result: any = await service.processExcelUpload(buffer);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('obrigatórias');
    });

    it('deve reportar erro se placar inválido', async () => {
      const buffer = createXlsxBuffer([{ selA: 'Brasil', golsA: 'abc', selB: 'Sérvia', golsB: 0, data: '', fase: '', grupo: '' }]);

      const result: any = await service.processExcelUpload(buffer);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('inválido');
    });

    it('deve lançar BadRequestException se planilha vazia', async () => {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([]);
      XLSX.utils.book_append_sheet(wb, ws, 'Vazia');
      const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

      await expect(service.processExcelUpload(buffer)).rejects.toThrow('vazia');
    });

    it('deve reportar erro se nenhuma partida pendente encontrada', async () => {
      const buffer = createXlsxBuffer([{ selA: 'Brasil', golsA: 2, selB: 'Inexistente', golsB: 0, data: '', fase: '', grupo: '' }]);
      mockPrisma.match.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result: any = await service.processExcelUpload(buffer);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('pendente');
    });
  });

  describe('resetFinishedMatches', () => {
    it('deve resetar partidas FINISHED com data futura e recalcular ranking', async () => {
      const futureMatch = { ...baseMatch, id: 'm1', status: 'FINISHED', homeScore: 2, awayScore: 1, matchDate: new Date(Date.now() + 86400000) };
      mockPrisma.match.findMany.mockResolvedValue([futureMatch]);
      mockPrisma.prediction.updateMany.mockResolvedValue({ count: 3 });
      mockPrisma.match.update.mockResolvedValue({ ...futureMatch, status: 'SCHEDULED', homeScore: null, awayScore: null });
      mockRankingService.getRanking.mockResolvedValue([{ id: 'u1', score: 100 }]);

      const result = await service.resetFinishedMatches();

      expect(result.matches).toHaveLength(1);
      expect(mockPrisma.match.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'SCHEDULED', homeScore: null, awayScore: null } }),
      );
      expect(mockRankingService.getRanking).toHaveBeenCalled();
      expect(mockRankingGateway.emitRankingUpdate).toHaveBeenCalledWith([{ id: 'u1', score: 100 }]);
    });

    it('deve retornar vazio se nenhuma partida futura FINISHED', async () => {
      mockPrisma.match.findMany.mockResolvedValue([]);

      const result = await service.resetFinishedMatches();

      expect(result.matches).toHaveLength(0);
      expect(mockPrisma.match.update).not.toHaveBeenCalled();
    });
  });
});
