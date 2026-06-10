import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as XLSX from 'xlsx';
import { PrismaService } from '../common/prisma.service';
import { GamificationService } from '../gamification/gamification.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ScoringService } from './scoring.service';
import { RankingService } from '../ranking/ranking.service';
import { RankingGateway } from '../ranking/ranking.gateway';
import { ReceiptsService } from '../receipts/receipts.service';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private gamificationService: GamificationService,
    private notificationsService: NotificationsService,
    private scoringService: ScoringService,
    private rankingService: RankingService,
    private rankingGateway: RankingGateway,
    private receiptsService: ReceiptsService,
  ) {}

  async getDashboard() {
    const [activeUsers, totalPredictions, totalMatches, finishedMatches, ranking, paidUsers] = await Promise.all([
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.prediction.count(),
      this.prisma.match.count(),
      this.prisma.match.count({ where: { status: 'FINISHED' } }),
      this.rankingService.getRanking(),
      this.prisma.user.count({ where: { hasPaid: true, isActive: true } }),
    ]);
    return { activeUsers, totalPredictions, totalMatches, finishedMatches, paidUsers, ranking };
  }

  async getFinancialDashboard() {
    const config = await this.prisma.systemConfig.findFirst();
    const betAmount = config?.betAmount ?? 20;
    const paidUsers = await this.prisma.user.count({ where: { hasPaid: true, isActive: true } });
    const pendingUsers = await this.prisma.user.count({ where: { hasPaid: false, isActive: true } });
    const totalCollected = Number(betAmount) * paidUsers;
    const prizePool = totalCollected;

    return {
      betAmount: Number(betAmount),
      paidUsers,
      pendingUsers,
      totalCollected,
      prizePool,
    };
  }

  async updateBetAmount(amount: number) {
    if (amount <= 0) throw new BadRequestException('Valor da aposta deve ser maior que zero');
    const config = await this.prisma.systemConfig.findFirst();
    if (!config) {
      return this.prisma.systemConfig.create({ data: { betAmount: amount } });
    }
    return this.prisma.systemConfig.update({
      where: { id: config.id },
      data: { betAmount: amount },
    });
  }

  async updatePixKey(pixKey: string) {
    if (!pixKey?.trim()) throw new BadRequestException('Chave PIX é obrigatória');
    const config = await this.prisma.systemConfig.findFirst();
    if (!config) {
      return this.prisma.systemConfig.create({ data: { pixKey: pixKey.trim() } });
    }
    return this.prisma.systemConfig.update({
      where: { id: config.id },
      data: { pixKey: pixKey.trim() },
    });
  }

  async getReceipts() {
    return this.receiptsService.findAll();
  }

  async approveReceipt(id: string, adminNotes?: string) {
    return this.receiptsService.approve(id, adminNotes);
  }

  async rejectReceipt(id: string, adminNotes?: string) {
    return this.receiptsService.reject(id, adminNotes);
  }

  async setPassword(userId: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    return this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
      select: {
        id: true,
        username: true,
        fullName: true,
      },
    });
  }

  async generateTempPassword(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const tempPassword = crypto.randomInt(1000, 10000).toString();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        isTempPassword: true,
      },
    });

    return {
      message: `Senha temporária gerada: ${tempPassword}. Informe esta senha ao usuário. Ele será obrigado a criar uma nova senha no primeiro acesso.`,
      tempPassword,
    };
  }

  async setResult(matchId: string, homeScore: number, awayScore: number) {
    if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0) {
      throw new BadRequestException('Placar deve ser um número inteiro não-negativo');
    }

    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    });

    if (!match) {
      throw new NotFoundException('Partida não encontrada');
    }

    const updatedMatch = await this.prisma.match.update({
      where: { id: matchId },
      data: {
        homeScore,
        awayScore,
        status: 'FINISHED',
      },
    });

    await this.scoringService.calculateAndDistributePoints(matchId);

    return updatedMatch;
  }

  async unlockKnockout() {
    const config = await this.prisma.systemConfig.findFirst();

    if (config) {
      return this.prisma.systemConfig.update({
        where: { id: config.id },
        data: { knockoutEnabled: true },
      });
    }

    return this.prisma.systemConfig.create({
      data: { knockoutEnabled: true },
    });
  }

  async getSystemConfig() {
    const config = await this.prisma.systemConfig.findFirst();

    if (!config) {
      return this.prisma.systemConfig.create({ data: {} });
    }

    return config;
  }

  async updateSystemConfig(data: {
    knockoutEnabled?: boolean;
    bettingEnabled?: boolean;
    betDeadline?: Date;
  }) {
    const config = await this.prisma.systemConfig.findFirst();

    if (!config) {
      return this.prisma.systemConfig.create({ data });
    }

    return this.prisma.systemConfig.update({
      where: { id: config.id },
      data,
    });
  }

  generateExcelTemplate(): Buffer {
    const wb = XLSX.utils.book_new();

    const headers = ['Seleção A', 'Placar A', 'Seleção B', 'Placar B', 'Data (opcional)', 'Fase (opcional)', 'Grupo (opcional)'];

    const exampleRow = ['Brasil', 2, 'Sérvia', 0, '2026-06-15', 'Fase de Grupos', 'G'];

    const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
    ws['!cols'] = [
      { wch: 25 },
      { wch: 12 },
      { wch: 25 },
      { wch: 12 },
      { wch: 15 },
      { wch: 22 },
      { wch: 10 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Partidas');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  async processExcelUpload(buffer: Buffer) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

    if (!rawRows || rawRows.length === 0) {
      throw new BadRequestException('Planilha vazia ou formato inválido');
    }

    const logger = new Logger('AdminService');
    const errors: { row: number; message: string }[] = [];
    let updated = 0;

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const rowNum = i + 2;

      try {
        const selA = (row['Seleção A'] ?? '').toString().trim();
        const placarA = row['Placar A'];
        const selB = (row['Seleção B'] ?? '').toString().trim();
        const placarB = row['Placar B'];
        const dataStr = (row['Data (opcional)'] ?? '').toString().trim();
        const faseStr = (row['Fase (opcional)'] ?? '').toString().trim();
        const grupoStr = (row['Grupo (opcional)'] ?? '').toString().trim();

        const timeA = String(selA).trim();
        const timeB = String(selB).trim();

        if (!timeA || !timeB) {
          errors.push({ row: rowNum, message: 'Seleção A e Seleção B são obrigatórias' });
          continue;
        }

        const golsA = parseInt(String(placarA), 10);
        const golsB = parseInt(String(placarB), 10);

        if (isNaN(golsA) || isNaN(golsB)) {
          errors.push({ row: rowNum, message: `Placar inválido: "${placarA}" x "${placarB}"` });
          continue;
        }

        if (!Number.isInteger(golsA) || !Number.isInteger(golsB) || golsA < 0 || golsB < 0) {
          errors.push({ row: rowNum, message: `Placar deve ser um número inteiro não-negativo: "${placarA}" x "${placarB}"` });
          continue;
        }

        const baseWhere: any = {
          OR: [
            { teamHome: timeA, teamAway: timeB },
            { teamHome: timeB, teamAway: timeA },
          ],
          status: { not: 'FINISHED' },
        };

        if (faseStr) baseWhere.phase = faseStr;
        if (grupoStr) baseWhere.groupLabel = grupoStr;

        let match = null;

        if (dataStr) {
          const matchDate = new Date(dataStr);
          if (!isNaN(matchDate.getTime())) {
            match = await this.prisma.match.findFirst({
              where: {
                ...baseWhere,
                matchDate: {
                  gte: new Date(matchDate.getFullYear(), matchDate.getMonth(), matchDate.getDate()),
                  lt: new Date(matchDate.getFullYear(), matchDate.getMonth(), matchDate.getDate() + 1),
                },
              },
            });
          }
        }

        if (!match) {
          match = await this.prisma.match.findFirst({
            where: baseWhere,
            orderBy: { matchDate: 'asc' },
          });

          if (dataStr && match) {
            logger.warn(`Linha ${rowNum}: Data "${dataStr}" não encontrada, usando primeira partida pendente entre "${timeA}" e "${timeB}"`);
          }
        }

        if (!match) {
          errors.push({
            row: rowNum,
            message: `Nenhum jogo pendente encontrado entre "${timeA}" e "${timeB}"`,
          });
          continue;
        }

        const isHomeA = match.teamHome === timeA;

        await this.prisma.match.update({
          where: { id: match.id },
          data: {
            homeScore: isHomeA ? golsA : golsB,
            awayScore: isHomeA ? golsB : golsA,
            status: 'FINISHED',
          },
        });

        await this.scoringService.calculateAndDistributePoints(match.id);

        updated++;
      } catch (err: any) {
        errors.push({ row: rowNum, message: err.message || 'Erro desconhecido' });
      }
    }

    return {
      success: errors.length === 0,
      message: `Planilha processada: ${updated} placares atualizados, ${errors.length} erro(s)`,
      updated,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async resetFinishedMatches() {
    const utcNow = new Date().toISOString();
    const matches = await this.prisma.match.findMany({
      where: { status: 'FINISHED', matchDate: { gt: utcNow } },
    });

    const matchIds = matches.map(m => m.id);

    if (matchIds.length > 0) {
      await this.prisma.prediction.updateMany({
        where: { matchId: { in: matchIds } },
        data: { pointsEarned: 0 },
      });
    }

    for (const match of matches) {
      await this.prisma.match.update({
        where: { id: match.id },
        data: { status: 'SCHEDULED', homeScore: null, awayScore: null },
      });
    }

    const ranking = await this.rankingService.getRanking();
    this.rankingGateway.emitRankingUpdate(ranking);

    const logger = new Logger('AdminService');
    logger.log(`${matches.length} partidas com data futura reiniciadas para SCHEDULED`);

    return {
      success: true,
      message: `${matches.length} partidas reiniciadas para SCHEDULED`,
      matches: matches.map(m => ({ id: m.id, teamHome: m.teamHome, teamAway: m.teamAway, matchDate: m.matchDate })),
    };
  }
}
