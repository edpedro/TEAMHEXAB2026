import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { Client, LocalAuth, GroupChat } from 'whatsapp-web.js';
import * as QRCode from 'qrcode';
import * as path from 'path';
import { existsSync, unlinkSync } from 'fs';

const PREDICTION_LOCK_MINUTES = 30;

export type WhatsAppStatus = 'CONNECTED' | 'DISCONNECTED' | 'WAITING_QR' | 'CONNECTING';

interface ConnectionState {
  status: WhatsAppStatus;
  qrCode: string | null;
  info: { phone: string; name: string } | null;
}

@Injectable()
export class WhatsappService implements OnModuleDestroy {
  private readonly logger = new Logger(WhatsappService.name);
  private client: Client | null = null;
  private connectionState: ConnectionState = {
    status: 'DISCONNECTED',
    qrCode: null,
    info: null,
  };
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private disconnectInitiatedByUser = false;
  private qrTimeout: NodeJS.Timeout | null = null;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  async onModuleDestroy() {
    this.clearReconnectTimer();
    this.clearQrTimeout();
    await this.disconnect();
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearQrTimeout(): void {
    if (this.qrTimeout) {
      clearTimeout(this.qrTimeout);
      this.qrTimeout = null;
    }
  }

  getStatus(): ConnectionState {
    return { ...this.connectionState };
  }

  async getQrCode(): Promise<string | null> {
    return this.connectionState.qrCode;
  }

  private cleanupOrphanedSession(): void {
    try {
      const sessionDir = path.join(process.cwd(), '.wwebjs_auth', 'session-teamhexa2026');
      for (const file of ['SingletonLock', 'SingletonSocket']) {
        const fp = path.join(sessionDir, file);
        if (existsSync(fp)) {
          unlinkSync(fp);
          this.logger.log(`Arquivo de sessão órfão removido: ${file}`);
        }
      }
    } catch {
      // cleanup errors are non-fatal
    }
  }

  async connect(): Promise<void> {
    if (this.client || this.connectionState.status === 'CONNECTING') {
      return;
    }

    this.connectionState = { status: 'CONNECTING', qrCode: null, info: null };
    this.clearQrTimeout();
    this.cleanupOrphanedSession();

    const puppeteerPath = this.config.get<string>('PUPPETEER_EXECUTABLE_PATH');

    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: 'teamhexa2026',
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-default-apps',
          '--disable-sync',
          '--disable-translate',
          '--hide-scrollbars',
          '--metrics-recording-only',
          '--mute-audio',
          '--safebrowsing-disable-auto-update',
        ],
        executablePath: puppeteerPath || undefined,
        timeout: 60000,
      },
    });

    this.client.on('qr', async (qr: string) => {
      this.logger.log('QR Code recebido');
      this.clearQrTimeout();
      try {
        this.connectionState.qrCode = await QRCode.toDataURL(qr);
      } catch {
        this.connectionState.qrCode = null;
      }
      this.connectionState.status = 'WAITING_QR';
      this.qrTimeout = setTimeout(() => {
        this.connectionState.qrCode = null;
        this.qrTimeout = null;
      }, 60000);
    });

    this.client.on('ready', async () => {
      this.logger.log('WhatsApp conectado');
      this.reconnectAttempts = 0;
      this.connectionState.status = 'CONNECTED';
      this.connectionState.qrCode = null;
      this.clearQrTimeout();
      const info = this.client?.info;
      this.connectionState.info = info
        ? { phone: info.wid.user, name: info.pushname || '' }
        : null;
      try {
        await this.syncGroups();
      } catch (err) {
        this.logger.error('Falha ao sincronizar grupos:', err.message);
      }
    });

    this.client.on('disconnected', async (reason: string) => {
      this.logger.warn(`WhatsApp desconectado: ${reason}`);
      this.connectionState = { status: 'DISCONNECTED', qrCode: null, info: null };
      if (this.client) {
        try {
          await this.client.destroy();
        } catch {
          // ignore destroy errors during disconnect
        }
        this.client = null;
      }
      if (!this.disconnectInitiatedByUser) {
        this.scheduleReconnect();
      }
      this.disconnectInitiatedByUser = false;
    });

    this.client.on('auth_failure', async (msg: string) => {
      this.logger.error(`Falha de autenticação: ${msg}`);
      this.connectionState = { status: 'DISCONNECTED', qrCode: null, info: null };
      if (this.client) {
        try {
          await this.client.destroy();
        } catch {
          // ignore destroy errors during auth failure
        }
        this.client = null;
      }
      setTimeout(() => {
        this.logger.log('Tentando reconectar após falha de autenticação...');
        this.connect().catch((err) =>
          this.logger.error(`Falha na reconexão pós-auth_failure: ${err.message}`),
        );
      }, 10000);
    });

    try {
      await this.client.initialize();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Falha ao inicializar: ${msg}`);
      this.connectionState = { status: 'DISCONNECTED', qrCode: null, info: null };
      this.client = null;
      if (msg.includes('already running')) {
        this.cleanupOrphanedSession();
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error(
        `Número máximo de tentativas de reconexão atingido (${this.maxReconnectAttempts})`,
      );
      return;
    }

    this.reconnectAttempts++;
    const delays = [5000, 10000, 30000, 60000];
    const delay = this.reconnectAttempts <= 3
      ? delays[this.reconnectAttempts - 1]
      : 60000;

    this.logger.log(
      `Reconectando em ${delay / 1000}s (tentativa ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
    );

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch (err) {
        this.logger.error(`Falha na reconexão: ${err.message}`);
        this.scheduleReconnect();
      }
    }, delay);
  }

  async disconnect(): Promise<void> {
    this.disconnectInitiatedByUser = true;
    this.clearReconnectTimer();
    if (this.client) {
      try {
        await this.client.destroy();
      } catch (err) {
        this.logger.warn(`Erro ao destruir cliente: ${err.message}`);
      }
      this.client = null;
    }
    this.connectionState = { status: 'DISCONNECTED', qrCode: null, info: null };
  }

  private async getClient(): Promise<Client> {
    if (!this.client) {
      throw new Error('WhatsApp não conectado');
    }
    const state = await this.client.getState().catch(() => null);
    if (state === null) {
      throw new Error('WhatsApp desconectado');
    }
    return this.client;
  }

  async syncGroups(): Promise<{ id: string; groupId: string; groupName: string; participantCount?: number }[]> {
    try {
      const c = await this.getClient();
      const chats = await c.getChats();
      const groups = chats
        .filter((chat): chat is GroupChat => chat.isGroup)
        .map((g) => ({
          id: g.id._serialized,
          groupId: g.id._serialized,
          groupName: g.name,
          participantCount: g.participants?.length || 0,
        }));

      for (const g of groups) {
        await this.prisma.whatsAppGroup.upsert({
          where: { groupId: g.groupId },
          update: { groupName: g.groupName },
          create: { groupId: g.groupId, groupName: g.groupName },
        });
      }

      return groups;
    } catch {
      const dbGroups = await this.prisma.whatsAppGroup.findMany();
      return dbGroups.map((g) => ({
        id: g.id,
        groupId: g.groupId,
        groupName: g.groupName,
      }));
    }
  }

  async setActiveGroup(groupId: string): Promise<void> {
    await this.prisma.whatsAppGroup.updateMany({
      data: { active: false },
    });
    await this.prisma.whatsAppGroup.update({
      where: { groupId },
      data: { active: true },
    });
  }

  async getActiveGroup(): Promise<{ groupId: string; groupName: string } | null> {
    const active = await this.prisma.whatsAppGroup.findFirst({
      where: { active: true },
    });
    return active ? { groupId: active.groupId, groupName: active.groupName } : null;
  }

  private async sendToGroup(message: string): Promise<boolean> {
    const group = await this.getActiveGroup();
    if (!group) {
      this.logger.warn('Nenhum grupo ativo configurado');
      return false;
    }

    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const c = await this.getClient();
        const footer = '\n\n🤖 Robô';
        await c.sendMessage(group.groupId, message + footer);
        return true;
      } catch (err) {
        if (attempt < maxAttempts) {
          this.logger.warn(
            `Falha ao enviar mensagem para grupo "${group.groupName}" (${group.groupId}) ` +
              `- tentativa ${attempt}/${maxAttempts}: ${err.message}. Aguardando 3s...`,
          );
          await new Promise((resolve) => setTimeout(resolve, 3000));
        } else {
          this.logger.error(
            `Falha ao enviar mensagem para grupo "${group.groupName}" (${group.groupId}) ` +
              `- tentativa ${attempt}/${maxAttempts}: ${err.message}`,
          );
          return false;
        }
      }
    }
    return false;
  }

  async sendTestMessage(message?: string): Promise<boolean> {
    const text = message || '🔔 Mensagem de teste do Bolão Copa 2026.';
    return this.sendToGroup(text);
  }

  async sendPredictionClosingNotification(
    teamHome: string,
    teamAway: string,
    matchDate: Date,
  ): Promise<boolean> {
    const timeStr = matchDate.toLocaleString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });
    const message = [
      '⚽ Atenção, participantes!',
      '',
      `Faltam apenas 5 minutos para o fechamento dos palpites da partida:`,
      '',
      `⚽ ${teamHome} x ${teamAway}`,
      '',
      `⏰ Horário da partida: ${timeStr}`,
      '',
      'Ainda não fez seu palpite? Corra para não perder a oportunidade de somar pontos e continuar na disputa pela liderança do ranking.',
      '',
      '🏆 Cada ponto pode fazer a diferença na classificação final.',
    ].join('\n');
    return this.sendToGroup(message);
  }

  async sendMatchFinishedNotification(
    teamHome: string,
    teamAway: string,
    homeScore: number,
    awayScore: number,
    predictions: { userName: string; predictedHome: number; predictedAway: number; pointsEarned: number; createdAt?: string | Date }[],
  ): Promise<boolean> {
    const sorted = [...predictions].sort(
      (a, b) =>
        b.pointsEarned - a.pointsEarned ||
        new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime(),
    );
    const message = [
      '🏁 Fim de jogo!',
      '',
      `⚽ ${teamHome} ${homeScore} x ${awayScore} ${teamAway}`,
      '',
      '✅ Resultado oficial atualizado no sistema.',
      '',
      ...(sorted.length > 0
        ? [
            '🎯 Palpites com mais pontos:',
            '',
            ...sorted
              .slice(0, 3)
              .map(
                (p, i) =>
                  `${this.getMedal(i)} ${p.userName}\nPalpite: ${p.predictedHome} x ${p.predictedAway} — ${p.pointsEarned} pts`,
              ),
          ]
        : ['Nenhum palpite registrado para esta partida.']),
    ].join('\n');
    return this.sendToGroup(message);
  }

  async sendRankingNotification(
    ranking: { position: number; userName: string; score: number }[],
  ): Promise<boolean> {
    if (ranking.length === 0) return false;

    const lines = ['🏆 Ranking Atualizado', ''];
    for (let i = 0; i < Math.min(5, ranking.length); i++) {
      const r = ranking[i];
      const medal = this.getMedal(i);
      lines.push(`${medal} ${i + 1}º ${r.userName} — ${r.score} pontos`);
    }
    const message = lines.join('\n');
    return this.sendToGroup(message);
  }

  private getMedal(index: number): string {
    switch (index) {
      case 0: return '🥇';
      case 1: return '🥈';
      case 2: return '🥉';
      default: return '🏅';
    }
  }

  async recordNotification(type: string, matchId: string | null, success: boolean, error?: string): Promise<void> {
    await this.prisma.whatsAppNotification.create({
      data: { type, matchId, success, error },
    });
  }

  async hasNotificationBeenSent(type: string, matchId: string): Promise<boolean> {
    const existing = await this.prisma.whatsAppNotification.findFirst({
      where: { type, matchId },
    });
    return !!existing;
  }

  @Cron('*/30 * * * * *')
  async handlePredictionClosingCheck(): Promise<void> {
    const group = await this.getActiveGroup();
    if (!group) {
      this.logger.warn('handlePredictionClosingCheck: nenhum grupo ativo — ignorando');
      return;
    }

    try {
      const now = Date.now();
      const lockWindowStart = now + 5 * 60 * 1000;
      const lockWindowEnd = lockWindowStart + 60 * 1000;

      const matches = await this.prisma.match.findMany({
        where: {
          status: 'SCHEDULED',
          matchDate: {
            gte: new Date(lockWindowStart - PREDICTION_LOCK_MINUTES * 60 * 1000),
            lte: new Date(lockWindowEnd + PREDICTION_LOCK_MINUTES * 60 * 1000),
          },
        },
      });

      this.logger.log(`Verificação de fechamento: ${matches.length} partida(s) na janela`);

      for (const match of matches) {
        const lockDeadline = new Date(match.matchDate.getTime() - PREDICTION_LOCK_MINUTES * 60 * 1000).getTime();
        const diffMin = Math.round((lockDeadline - now) / 60000);

        this.logger.log(
          `Jogo: ${match.teamHome} x ${match.teamAway} ` +
          `| ID: ${match.id} ` +
          `| Partida: ${match.matchDate.toISOString()} ` +
          `| Bloqueio: ${new Date(lockDeadline).toISOString()} ` +
          `| Agora: ${new Date(now).toISOString()} ` +
          `| Diferença para bloqueio: ${diffMin}min`,
        );

        if (now >= lockDeadline - 5 * 60 * 1000 && now < lockDeadline) {
          const alreadySent = await this.hasNotificationBeenSent('prediction_closing', match.id);
          if (alreadySent) {
            this.logger.log(`Notificação já enviada para ${match.teamHome} x ${match.teamAway} — ignorando`);
            continue;
          }

          this.logger.log(`Enviando notificação de fechamento para ${match.teamHome} x ${match.teamAway}`);
          const sent = await this.sendPredictionClosingNotification(
            match.teamHome,
            match.teamAway,
            match.matchDate,
          );

          if (sent) {
            await this.recordNotification('prediction_closing', match.id, true);
            this.logger.log(`Notificação de fechamento enviada com sucesso para ${match.teamHome} x ${match.teamAway}`);
          } else {
            this.logger.error(`Falha ao enviar notificação de fechamento para ${match.teamHome} x ${match.teamAway}`);
            await this.recordNotification('prediction_closing', match.id, false, 'Falha ao enviar');
          }
        } else {
          this.logger.log(
            `Fora da janela de notificação para ${match.teamHome} x ${match.teamAway}: ` +
            `now=${new Date(now).toISOString()}, ` +
            `janela=[${new Date(lockDeadline - 5 * 60 * 1000).toISOString()}, ${new Date(lockDeadline).toISOString()})`,
          );
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Erro no check de fechamento: ${msg}`);
    }
  }

  async checkAndSendClosingNotification(
    teamHome: string,
    teamAway: string,
    matchDate: Date,
  ): Promise<boolean> {
    this.logger.log(`Disparo manual: ${teamHome} x ${teamAway} às ${matchDate.toISOString()}`);
    const sent = await this.sendPredictionClosingNotification(teamHome, teamAway, matchDate);
    return sent;
  }
}
