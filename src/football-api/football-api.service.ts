import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { ScoringService } from '../admin/scoring.service';
import { MatchStatus } from '@prisma/client';
import axios, { AxiosInstance } from 'axios';
import {
  WcMatch,
  WcTeam,
  WcStadium,
  WcStadiumsResponse,
  WcGroup,
  WcGroupsResponse,
  WcGamesResponse,
  WcTeamsResponse,
  WcAuthResponse,
  SyncStatus,
} from './dto/worldcup-api.types';
import { getTeamInfo } from './dto/team-mapping';
import { getStadiumInfo } from './dto/stadium-mapping';

const PHASE_MAP: Record<string, string> = {
  group: 'Fase de Grupos',
  r32: 'Rodada de 32',
  r16: 'Oitavas de final',
  qf: 'Quartas de final',
  sf: 'Semifinais',
  third: 'Terceiro Lugar',
  final: 'Final',
};

@Injectable()
export class FootballApiService implements OnModuleInit {
  private readonly logger = new Logger(FootballApiService.name);
  private readonly baseUrl: string;
  private apiToken: string | null = null;
  private apiTokenExpires: Date | null = null;
  private readonly http: AxiosInstance;

  private lastFullSync: Date | null = null;
  private lastResultsSync: Date | null = null;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private scoringService: ScoringService,
  ) {
    this.baseUrl = this.config.get<string>('WORLDCUP_API_URL', 'https://worldcup26.ir');
    this.http = axios.create({ baseURL: this.baseUrl, timeout: 30000 });
  }

  async onModuleInit() {
    const count = await this.prisma.match.count();
    if (count === 0) {
      this.logger.log('Banco vazio — iniciando sync automático...');
      try {
        const result = await this.syncAll();
        this.logger.log(`Sync inicial: ${result.matches} jogos importados`);
      } catch (err) {
        this.logger.error('Falha no sync inicial:', err.message);
      }
    } else {
      this.logger.log(`Banco já populado com ${count} partidas`);
    }
  }

  private async ensureAuth(): Promise<string | null> {
    if (this.apiToken && this.apiTokenExpires && this.apiTokenExpires > new Date()) {
      return this.apiToken;
    }

    const email = this.config.get<string>('WORLDCUP_API_EMAIL');
    const password = this.config.get<string>('WORLDCUP_API_PASSWORD');

    try {
      if (email && password) {
        const { data } = await this.http.post<WcAuthResponse>(
          '/auth/authenticate',
          { email, password },
        );
        this.applyToken(data.token);
        this.logger.log(`Autenticado na API worldcup26.ir como ${email}`);
        return this.apiToken;
      }

      const randomEmail = `teamhexa-${Date.now()}@teamhexa2026.app`;
      const randomPassword = `Thx${Math.random().toString(36).slice(-10)}!`;
      const { data } = await this.http.post<WcAuthResponse>(
        '/auth/register',
        { name: 'TEAMHEXA2026', email: randomEmail, password: randomPassword },
      );
      this.applyToken(data.token);
      this.logger.log(`Conta de serviço criada e autenticada: ${randomEmail}`);
      return this.apiToken;
    } catch (err) {
      this.logger.warn(`Falha na autenticação, tentando sem token: ${err.message}`);
      return null;
    }
  }

  private applyToken(token: string) {
    this.apiToken = token;
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      this.apiTokenExpires = new Date(payload.exp * 1000);
    } catch {
      this.apiTokenExpires = new Date(Date.now() + 84 * 24 * 60 * 60 * 1000);
    }
  }

  private getHeaders(): Record<string, string> {
    if (!this.apiToken) return {};
    return { Authorization: `Bearer ${this.apiToken}` };
  }

  async fetchTeams(): Promise<WcTeam[]> {
    await this.ensureAuth();
    const { data } = await this.http.get<WcTeamsResponse>('/get/teams', {
      headers: this.getHeaders(),
    });
    return data.teams;
  }

  async fetchMatches(): Promise<WcMatch[]> {
    await this.ensureAuth();
    const { data } = await this.http.get<WcGamesResponse>('/get/games', {
      headers: this.getHeaders(),
    });
    return data.games;
  }

  async fetchGroups(): Promise<WcGroup[]> {
    await this.ensureAuth();
    const { data } = await this.http.get<WcGroupsResponse>('/get/groups', {
      headers: this.getHeaders(),
    });
    return data.groups;
  }

  async fetchStadiums(): Promise<WcStadium[]> {
    await this.ensureAuth();
    const { data } = await this.http.get<WcStadiumsResponse>('/get/stadiums', {
      headers: this.getHeaders(),
    });
    return data.stadiums;
  }

  async fetchHealth() {
    const { data } = await this.http.get('/health');
    return data;
  }

  async syncAll(): Promise<{ teams: number; matches: number; stadiums: number; groups: number }> {
    const [teams, matches, stadiums, groups] = await Promise.all([
      this.fetchTeams(),
      this.fetchMatches(),
      this.fetchStadiums(),
      this.fetchGroups(),
    ]);
    this.logger.log(`API: ${teams.length} times, ${matches.length} jogos, ${stadiums.length} estádios, ${groups.length} grupos`);

    let syncedMatches = 0;
    let updatedMatches = 0;

    for (const match of matches) {
      const isKnockoutTbd = match.home_team_id === '0' && match.away_team_id === '0';
      const homeEn = match.home_team_name_en || match.home_team_label || null;
      const awayEn = match.away_team_name_en || match.away_team_label || null;

      if (!homeEn || !awayEn) {
        if (isKnockoutTbd) continue;
        this.logger.warn(`Partida ${match.id} sem nomes: home=${homeEn} away=${awayEn}`);
        continue;
      }

      const matchDate = this.parseLocalDate(match.local_date);
      if (!matchDate) continue;

      const phase = this.parsePhase(match.type);
      const status = MatchStatus.SCHEDULED;
      const homeScore = null;
      const awayScore = null;

      const homeInfo = getTeamInfo(homeEn);
      const awayInfo = getTeamInfo(awayEn);
      const stadiumInfo = getStadiumInfo(match.stadium_id);

      const existing = await this.prisma.match.findFirst({
        where: {
          teamHome: homeInfo.name,
          teamAway: awayInfo.name,
          matchDate: matchDate,
        },
      });

      const matchData = {
        teamHome: homeInfo.name,
        teamAway: awayInfo.name,
        teamHomeIso: homeInfo.iso2 || null,
        teamAwayIso: awayInfo.iso2 || null,
        flagHome: homeInfo.flag || null,
        flagAway: awayInfo.flag || null,
        stadium: stadiumInfo?.name ?? null,
        city: stadiumInfo?.city ?? null,
        country: stadiumInfo?.country ?? null,
        groupLabel: match.group ?? null,
        matchDate,
        phase,
        status,
        homeScore: homeScore ?? null,
        awayScore: awayScore ?? null,
      };

      if (existing) {
        const isFinishedWithScores = existing.status === MatchStatus.FINISHED && existing.homeScore !== null && existing.awayScore !== null;
        const apiHasFinished = match.finished === 'TRUE';
        const matchStillScheduled = existing.status === MatchStatus.SCHEDULED;

        const needsUpdate = apiHasFinished && matchStillScheduled;
        const needsPhaseUpdate = !isFinishedWithScores && matchData.phase !== existing.phase;

        if (needsUpdate || needsPhaseUpdate) {
          const updateData: any = {};
          if (needsUpdate) {
            updateData.homeScore = matchData.homeScore;
            updateData.awayScore = matchData.awayScore;
            updateData.status = matchData.status;
          }
          if (needsPhaseUpdate) {
            updateData.phase = matchData.phase;
          }
          if (Object.keys(updateData).length > 0) {
            await this.prisma.match.update({
              where: { id: existing.id },
              data: updateData,
            });
            updatedMatches++;
          }
        }
      } else {
        await this.prisma.match.create({ data: matchData });
        syncedMatches++;
      }
    }

    this.lastFullSync = new Date();
    this.logger.log(`Sync completo: ${syncedMatches} novos, ${updatedMatches} atualizados, ${stadiums.length} estádios, ${groups.length} grupos`);
    return { teams: teams.length, matches: syncedMatches, stadiums: stadiums.length, groups: groups.length };
  }

  async syncResults(): Promise<number> {
    const matches = await this.fetchMatches();

    let updated = 0;

    for (const match of matches) {
      if (match.finished !== 'TRUE') continue;

      const homeEn = match.home_team_name_en || match.home_team_label || null;
      const awayEn = match.away_team_name_en || match.away_team_label || null;
      if (!homeEn || !awayEn) continue;

      const matchDate = this.parseLocalDate(match.local_date);
      if (!matchDate) continue;

      const homeInfo = getTeamInfo(homeEn);
      const awayInfo = getTeamInfo(awayEn);

      const existing = await this.prisma.match.findFirst({
        where: { teamHome: homeInfo.name, teamAway: awayInfo.name, matchDate },
      });

      if (existing && existing.status !== MatchStatus.FINISHED && matchDate <= new Date()) {
        await this.prisma.match.update({
          where: { id: existing.id },
          data: {
            homeScore: this.parseScore(match.home_score),
            awayScore: this.parseScore(match.away_score),
            status: MatchStatus.FINISHED,
          },
        });
        await this.scoringService.calculateAndDistributePoints(existing.id);
        updated++;
      }
    }

    this.lastResultsSync = new Date();
    this.logger.log(`Resultados atualizados: ${updated}`);
    return updated;
  }

  async getStatus(): Promise<SyncStatus> {
    let apiConnected = false;
    let apiTotals = { teams: 0, matches: 0, stadiums: 0, groups: 0 };
    try {
      await this.fetchHealth();
      apiConnected = true;
      const [teams, matches, stadiums, groups] = await Promise.all([
        this.fetchTeams().catch(() => []),
        this.fetchMatches().catch(() => []),
        this.fetchStadiums().catch(() => []),
        this.fetchGroups().catch(() => []),
      ]);
      apiTotals = { teams: teams.length, matches: matches.length, stadiums: stadiums.length, groups: groups.length };
    } catch {
      apiConnected = false;
    }

    const [matchCount, predictionCount, userCount] = await Promise.all([
      this.prisma.match.count(),
      this.prisma.prediction.count(),
      this.prisma.user.count(),
    ]);

    return {
      apiConnected,
      authenticated: !!this.apiToken,
      lastFullSync: this.lastFullSync?.toISOString() ?? null,
      lastResultsSync: this.lastResultsSync?.toISOString() ?? null,
      totals: { matches: matchCount, predictions: predictionCount, users: userCount },
      apiTotals,
    };
  }

  @Cron('*/30 * * * *')
  async handleCronResults() {
    this.logger.log('CRON: verificando resultados...');
    try {
      await this.syncResults();
    } catch (err) {
      this.logger.error('CRON resultados falhou:', err.message);
    }
  }

  @Cron('0 */6 * * *')
  async handleCronFullSync() {
    this.logger.log('CRON: sincronização completa...');
    try {
      await this.syncAll();
    } catch (err) {
      this.logger.error('CRON sync completo falhou:', err.message);
    }
  }

  private parsePhase(apiType: string): string {
    return PHASE_MAP[apiType] || apiType;
  }

  private mapStatus(finished: string, matchDate: Date): MatchStatus {
    if (finished === 'TRUE') return MatchStatus.FINISHED;
    if (matchDate <= new Date()) return MatchStatus.IN_PROGRESS;
    return MatchStatus.SCHEDULED;
  }

  private parseLocalDate(dateStr: string): Date | null {
    if (!dateStr) return null;
    const [datePart, timePart] = dateStr.split(' ');
    if (!datePart) return null;
    const [month, day, year] = datePart.split('/');
    if (!month || !day || !year) return null;
    const hours = timePart ? timePart.split(':')[0] : '00';
    const minutes = timePart ? timePart.split(':')[1] : '00';
    return new Date(+year, +month - 1, +day, +hours, +minutes);
  }

  private parseScore(score: string | number | null | undefined): number {
    if (score === null || score === undefined) return 0;
    if (typeof score === 'number') return score;
    const parsed = parseInt(score, 10);
    return isNaN(parsed) ? 0 : parsed;
  }
}
