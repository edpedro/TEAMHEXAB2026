import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { Client, LocalAuth, GroupChat } from 'whatsapp-web.js';
import * as QRCode from 'qrcode';
import * as path from 'path';
import { existsSync, unlinkSync, readdirSync } from 'fs';
import { execSync } from 'child_process';

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

  private getTodayBrtRange(): { start: Date; end: Date } {
    const now = new Date();
    const brtDateStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const start = new Date(`${brtDateStr}T00:00:00-03:00`);
    const end = new Date(`${brtDateStr}T23:59:59-03:00`);
    return { start, end };
  }

  private isoToFlagEmoji(iso: string | null | undefined): string {
    if (!iso) return '';
    const codePoints = iso
      .toUpperCase()
      .split('')
      .map((char) => 0x1F1E6 + char.charCodeAt(0) - 65);
    return String.fromCodePoint(...codePoints);
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

  private cleanupSessionOnLogout(): void {
    try {
      const sessionDir = path.join(process.cwd(), '.wwebjs_auth', 'session-teamhexa2026');
      if (existsSync(sessionDir)) {
        const files = readdirSync(sessionDir);
        for (const file of files) {
          const fp = path.join(sessionDir, file);
          try { unlinkSync(fp); } catch { /* skip locked files */ }
        }
        this.logger.log(`Sessão WhatsApp removida após LOGOUT (${files.length} arquivos)`);
      }
    } catch (err) {
      this.logger.warn(`Falha ao limpar sessão: ${err.message}`);
    }
  }

  private forceKillOrphanedChrome(): void {
    try {
      const result = execSync(
        `powershell -NoProfile -Command "$p = Get-CimInstance Win32_Process -Filter \\"Name = 'chrome.exe'\\" | Where-Object { $_.CommandLine -like '*teamhexa2026*' }; if ($p) { $p | Select-Object -ExpandProperty ProcessId | ForEach-Object { Stop-Process -Id $_ -Force }; write-output \\"Killed $($p.Count) process(es)\\" } else { write-output 'No orphans' }"`,
        { timeout: 15000, windowsHide: true, encoding: 'utf8' },
      );
      this.logger.log(`Verificação de Chrome órfão: ${result.toString().trim()}`);
    } catch {
      // non-fatal — no matching processes or PowerShell unavailable
    }
  }

  private createClient(): Client {
    const puppeteerPath = this.config.get<string>('PUPPETEER_EXECUTABLE_PATH');

    const client = new Client({
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

    client.on('qr', async (qr: string) => {
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

    client.on('ready', async () => {
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

    client.on('disconnected', async (reason: string) => {
      this.logger.warn(`WhatsApp desconectado: ${reason}`);
      this.connectionState = { status: 'DISCONNECTED', qrCode: null, info: null };

      const wasLoggedOut = reason === 'LOGOUT';
      if (wasLoggedOut) {
        this.logger.log('LOGOUT detectado — limpando sessão');
        this.disconnectInitiatedByUser = true;
      }

      if (this.client) {
        try {
          await this.client.destroy();
        } catch {
          // ignore destroy errors during disconnect
        }
        this.client = null;
      }

      if (wasLoggedOut) {
        this.cleanupSessionOnLogout();
        this.forceKillOrphanedChrome();
        this.disconnectInitiatedByUser = false;
        setTimeout(() => {
          this.logger.log('Tentando reconectar após LOGOUT...');
          this.connect().catch((err) =>
            this.logger.error(`Falha na reconexão pós-LOGOUT: ${err.message}`),
          );
        }, 3000);
      } else if (!this.disconnectInitiatedByUser) {
        this.scheduleReconnect();
      }
      this.disconnectInitiatedByUser = false;
    });

    client.on('auth_failure', async (msg: string) => {
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
      this.forceKillOrphanedChrome();
      this.cleanupSessionOnLogout();
      setTimeout(() => {
        this.logger.log('Tentando reconectar após falha de autenticação...');
        this.connect().catch((err) =>
          this.logger.error(`Falha na reconexão pós-auth_failure: ${err.message}`),
        );
      }, 10000);
    });

    return client;
  }

  async connect(): Promise<void> {
    if (this.client || this.connectionState.status === 'CONNECTING') {
      return;
    }

    this.connectionState = { status: 'CONNECTING', qrCode: null, info: null };
    this.clearQrTimeout();
    this.cleanupOrphanedSession();
    this.forceKillOrphanedChrome();

    let current = this.createClient();
    this.client = current;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await current.initialize();
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Falha ao inicializar (tentativa ${attempt}/2): ${msg}`);
        this.connectionState = { status: 'DISCONNECTED', qrCode: null, info: null };
        if (attempt < 2) {
          this.logger.log('Limpando recursos e tentando novamente...');
          this.client = null;
          if (msg.includes('already running') || msg.includes('detached Frame')) {
            this.forceKillOrphanedChrome();
          }
          this.cleanupOrphanedSession();
          await new Promise((resolve) => setTimeout(resolve, 2000));
          this.connectionState = { status: 'CONNECTING', qrCode: null, info: null };
          current = this.createClient();
          this.client = current;
        } else {
          this.client = null;
        }
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
        await c.sendMessage(group.groupId, message);
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
    teamHomeIso?: string | null,
    teamAwayIso?: string | null,
  ): Promise<boolean> {
    const flagHome = this.isoToFlagEmoji(teamHomeIso);
    const flagAway = this.isoToFlagEmoji(teamAwayIso);
    const message = [
      '⚠️ Atenção, participantes!',
      '',
      'Faltam apenas 5 minutos para o fechamento dos palpites da partida:',
      '',
      `${flagHome} ${teamHome} x ${teamAway} ${flagAway}`,
      '',
      '⏰ Após o bloqueio não será mais possível alterar ou registrar palpites para esta partida.',
      '',
      '🤖 Robô do Bolão.',
    ].join('\n');
    return this.sendToGroup(message);
  }

  async sendMatchFinishedNotification(
    teamHome: string,
    teamAway: string,
    homeScore: number,
    awayScore: number,
    topLeaders: {
      position: number;
      userName: string;
      totalScore: number;
      predictedHome: number | null;
      predictedAway: number | null;
      pointsEarned: number | null;
    }[],
    teamHomeIso?: string | null,
    teamAwayIso?: string | null,
  ): Promise<boolean> {
    const flagHome = this.isoToFlagEmoji(teamHomeIso);
    const flagAway = this.isoToFlagEmoji(teamAwayIso);
    const message = [
      '🏁 Fim de jogo!',
      '',
      `${flagHome} ${teamHome} ${homeScore} x ${awayScore} ${teamAway} ${flagAway}`,
      '',
      '✅ Resultado oficial atualizado no sistema.',
      '',
      ...(topLeaders.length > 0
        ? [
            '🏆 Líderes do Bolão',
            '',
            ...topLeaders.flatMap((l, i) => {
              const palpite =
                l.predictedHome !== null && l.predictedAway !== null
                  ? `${teamHome} ${l.predictedHome} x ${l.predictedAway} ${teamAway}`
                  : '—';
              const lines = [
                `${this.getMedal(l.position - 1)} ${l.userName} — ${l.totalScore} pontos`,
                `Palpite: ${palpite}`,
                `Pontos obtidos no jogo: ${l.pointsEarned ?? 0}`,
              ];
              return i < topLeaders.length - 1 ? [...lines, '', '---', ''] : lines;
            }),
          ]
        : ['Nenhum palpite registrado para esta partida.']),
      '',
      '🤖 Robô do Bolão.',
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
      const today = this.getTodayBrtRange();

      const matches = await this.prisma.match.findMany({
        where: {
          status: 'SCHEDULED',
          matchDate: {
            gte: today.start,
            lte: today.end,
          },
        },
      });

      this.logger.log(`Verificação de fechamento: ${matches.length} partida(s) hoje`);

      for (const match of matches) {
        try {
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
              match.teamHomeIso,
              match.teamAwayIso,
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
        } catch (innerErr) {
          const innerMsg = innerErr instanceof Error ? innerErr.message : String(innerErr);
          this.logger.error(`Erro ao processar notificação para ${match.teamHome} x ${match.teamAway}: ${innerMsg}`);
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
    teamHomeIso?: string,
    teamAwayIso?: string,
  ): Promise<boolean> {
    this.logger.log(`Disparo manual: ${teamHome} x ${teamAway} às ${matchDate.toISOString()}`);
    const sent = await this.sendPredictionClosingNotification(teamHome, teamAway, matchDate, teamHomeIso, teamAwayIso);
    return sent;
  }
}
