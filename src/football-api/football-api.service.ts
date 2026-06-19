import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { ScoringService } from '../admin/scoring.service';
import { MatchesGateway } from '../matches/matches.gateway';
import { MatchStatus } from '@prisma/client';
import axios, { AxiosInstance } from 'axios';
import { Agent as HttpsAgent } from 'https';
import {
  WcMatch,
  WcTeam,
  WcStadium,
  WcStadiumsResponse,
  WcGroup,
  WcGroupsResponse,
  WcGamesResponse,
  WcTeamsResponse,
  WcTeamStanding,
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

const LIVE_POLL_INTERVAL_MS = 120_000;
const IDLE_POLL_INTERVAL_MS = 1_800_000;
const MATCH_DURATION_MS = 135 * 60 * 1000;

@Injectable()
export class FootballApiService implements OnModuleInit {
  private readonly logger = new Logger(FootballApiService.name);
  private readonly http: AxiosInstance;

  private lastFullSync: Date | null = null;
  private lastResultsSync: Date | null = null;
  private isSyncing = false;
  private consecutiveFailures = 0;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private scoringService: ScoringService,
    private matchesGateway: MatchesGateway,
  ) {
    const baseUrl = this.config.get<string>('WORLDCUP_API_URL', 'https://worldcup26.ir');
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: 30_000,
      headers: { 'User-Agent': 'TEAMHEXA2026/1.0' },
      httpsAgent: new HttpsAgent({ keepAlive: false }),
    });
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

  async fetchTeams(): Promise<WcTeam[]> {
    const { data } = await this.http.get<WcTeamsResponse>('/get/teams');
    return data.teams;
  }

  async fetchMatches(): Promise<WcMatch[]> {
    const { data } = await this.http.get<WcGamesResponse>('/get/games');
    return data.games;
  }

  async fetchGroups(): Promise<WcGroup[]> {
    const { data } = await this.http.get<WcGroupsResponse>('/get/groups');
    return data.groups;
  }

  async fetchStadiums(): Promise<WcStadium[]> {
    const { data } = await this.http.get<WcStadiumsResponse>('/get/stadiums');
    return data.stadiums;
  }

  async fetchStandings() {
    const [groups, teams] = await Promise.all([
      this.fetchGroups(),
      this.fetchTeams(),
    ]);

    const teamMap = new Map<string, WcTeam>();
    for (const team of teams) {
      teamMap.set(team.id, team);
    }

    return groups.map((group) => ({
      name: group.name,
      teams: (group.teams || []).map((standing: WcTeamStanding) => {
        const team = teamMap.get(standing.team_id);
        const info = team
          ? getTeamInfo(team.name_en)
          : { name: `Time #${standing.team_id}`, flag: '', iso2: '' };
        return {
          teamId: standing.team_id,
          name: info.name,
          flag: info.flag,
          iso2: info.iso2,
          mp: parseInt(standing.mp, 10) || 0,
          w: parseInt(standing.w, 10) || 0,
          l: parseInt(standing.l, 10) || 0,
          d: parseInt(standing.d, 10) || 0,
          pts: parseInt(standing.pts, 10) || 0,
          gf: parseInt(standing.gf, 10) || 0,
          ga: parseInt(standing.ga, 10) || 0,
          gd: parseInt(standing.gd, 10) || 0,
        };
      }),
    }));
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

    const nowTs = Date.now();

    for (const match of matches) {
      const isKnockoutTbd = match.home_team_id === '0' && match.away_team_id === '0';
      const homeEn = match.home_team_name_en || match.home_team_label || null;
      const awayEn = match.away_team_name_en || match.away_team_label || null;

      if (!homeEn || !awayEn) {
        if (isKnockoutTbd) continue;
        this.logger.warn(`Partida ${match.id} sem nomes: home=${homeEn} away=${awayEn}`);
        continue;
      }

      const stadiumInfo = getStadiumInfo(match.stadium_id);
      const matchDate = this.parseLocalDate(match.local_date, stadiumInfo?.utcOffsetHours);
      if (!matchDate) continue;

      const phase = this.parsePhase(match.type);
      const status = MatchStatus.SCHEDULED;
      const homeScore = null;
      const awayScore = null;

      const homeInfo = getTeamInfo(homeEn);
      const awayInfo = getTeamInfo(awayEn);

      const existing = await this.prisma.match.findFirst({
        where: {
          teamHome: homeInfo.name,
          teamAway: awayInfo.name,
          phase,
          groupLabel: match.group || null,
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
        const apiHomeScore = this.parseScore(match.home_score);
        const apiAwayScore = this.parseScore(match.away_score);
        const apiFinished = match.finished === 'TRUE';
        const apiHasScore = match.home_score != null && match.home_score !== '';
        const needsDateUpdate = matchDate.getTime() !== existing.matchDate.getTime();
        const needsPhaseUpdate = matchData.phase !== existing.phase;
        const scoresChanged = apiHasScore && (existing.homeScore !== apiHomeScore || existing.awayScore !== apiAwayScore);
        const needsScoreUpdate = (apiFinished && apiHasScore) || (scoresChanged && (apiHomeScore > 0 || apiAwayScore > 0));

        if (needsDateUpdate || needsScoreUpdate || needsPhaseUpdate) {
          const updateData: any = {};
          if (needsDateUpdate) updateData.matchDate = matchDate;
          if (needsScoreUpdate) {
            updateData.homeScore = apiHomeScore;
            updateData.awayScore = apiAwayScore;
            if (apiFinished && nowTs > matchDate.getTime() + MATCH_DURATION_MS) {
              updateData.status = MatchStatus.FINISHED;
            }
          }
          if (needsPhaseUpdate) updateData.phase = matchData.phase;
          await this.prisma.match.update({
            where: { id: existing.id },
            data: updateData,
          });
          updatedMatches++;

          if (needsScoreUpdate && updateData.status === MatchStatus.FINISHED) {
            await this.scoringService.calculateAndDistributePoints(existing.id);
          } else if (needsScoreUpdate && existing.status === MatchStatus.FINISHED) {
            await this.scoringService.calculateAndDistributePoints(existing.id);
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
    const apiMatches = await this.fetchMatches();
    let updated = 0;
    const changedMatchIds: string[] = [];
    const finishedMatchIds: string[] = [];

    for (const apiMatch of apiMatches) {
      if (apiMatch.home_team_id === '0' && apiMatch.away_team_id === '0') continue;

      const homeEn = apiMatch.home_team_name_en || apiMatch.home_team_label || null;
      const awayEn = apiMatch.away_team_name_en || apiMatch.away_team_label || null;
      if (!homeEn || !awayEn) continue;

      const stadiumInfo = getStadiumInfo(apiMatch.stadium_id);
      const matchDate = this.parseLocalDate(apiMatch.local_date, stadiumInfo?.utcOffsetHours);
      if (!matchDate) continue;

      const homeInfo = getTeamInfo(homeEn);
      const awayInfo = getTeamInfo(awayEn);
      const phase = this.parsePhase(apiMatch.type);

      const existing = await this.prisma.match.findFirst({
        where: {
          teamHome: homeInfo.name,
          teamAway: awayInfo.name,
          phase,
          groupLabel: apiMatch.group || null,
        },
      });

      if (!existing) continue;

      const apiHomeScore = this.parseScore(apiMatch.home_score);
      const apiAwayScore = this.parseScore(apiMatch.away_score);
      const apiFinished = apiMatch.finished === 'TRUE';
      const now = new Date();
      const nowTs = now.getTime();
      const matchStart = matchDate.getTime();
      const isInTimeWindow = !apiFinished
        && nowTs >= matchStart
        && nowTs <= matchStart + MATCH_DURATION_MS;
      const apiHasScore = apiMatch.home_score != null && apiMatch.home_score !== '';
      const scoresChanged = apiHasScore && (existing.homeScore !== apiHomeScore || existing.awayScore !== apiAwayScore);

      if (apiFinished && apiHasScore && nowTs > matchStart + MATCH_DURATION_MS) {
        const needsFinish = existing.status !== MatchStatus.FINISHED;
        const needsScoreFix = scoresChanged;
        if (needsFinish || needsScoreFix) {
          const updateData: any = {
            homeScore: apiHomeScore,
            awayScore: apiAwayScore,
          };
          if (needsFinish) updateData.status = MatchStatus.FINISHED;
          await this.prisma.match.update({
            where: { id: existing.id },
            data: updateData,
          });
          await this.scoringService.calculateAndDistributePoints(existing.id);
          updated++;
          changedMatchIds.push(existing.id);
          if (needsFinish) finishedMatchIds.push(existing.id);
        }
      } else if (isInTimeWindow && scoresChanged) {
        const updateData: any = {
          homeScore: apiHomeScore,
          awayScore: apiAwayScore,
        };
        if (existing.status === MatchStatus.SCHEDULED) {
          updateData.status = MatchStatus.IN_PROGRESS;
        }
        await this.prisma.match.update({
          where: { id: existing.id },
          data: updateData,
        });
        updated++;
        changedMatchIds.push(existing.id);
      } else if (isInTimeWindow && existing.status === MatchStatus.SCHEDULED) {
        await this.prisma.match.update({
          where: { id: existing.id },
          data: { status: MatchStatus.IN_PROGRESS },
        });
        changedMatchIds.push(existing.id);
        updated++;
      } else if (existing.status === MatchStatus.IN_PROGRESS && !apiFinished && !isInTimeWindow) {
        await this.prisma.match.update({
          where: { id: existing.id },
          data: { status: MatchStatus.SCHEDULED, homeScore: null, awayScore: null },
        });
        changedMatchIds.push(existing.id);
        updated++;
      }
    }

    if (changedMatchIds.length > 0) {
      const updatedMatches = await this.prisma.match.findMany({
        where: { id: { in: changedMatchIds } },
      });
      try {
        this.matchesGateway.emitMatchesBatchUpdate(updatedMatches);

        const liveMatches = updatedMatches.filter((m) => m.status === MatchStatus.IN_PROGRESS);
        if (liveMatches.length > 0) {
          this.matchesGateway.emitLiveStatus(liveMatches.length, liveMatches);
        }
      } catch (emitErr) {
        this.logger.warn(`Falha ao emitir WebSocket: ${emitErr.message}`);
      }

      this.logger.log(`Live sync: ${changedMatchIds.length} partidas atualizadas (${finishedMatchIds.length} finalizadas, ${changedMatchIds.length - finishedMatchIds.length} ao vivo)`);
    }

    this.lastResultsSync = new Date();
    this.consecutiveFailures = 0;
    return updated;
  }

  @Cron('* * * * *')
  async handleCronResults() {
    if (this.isSyncing) return;

    const now = Date.now();
    const lastSync = this.lastResultsSync?.getTime() ?? 0;
    const secondsSinceLastSync = (now - lastSync) / 1000;

    if (secondsSinceLastSync < 60) return;

    const liveCount = await this.prisma.match.count({
      where: { status: MatchStatus.IN_PROGRESS },
    });

    const hasLiveMatches = liveCount > 0;

    const nearMatch = await this.prisma.match.count({
      where: {
        status: MatchStatus.SCHEDULED,
        matchDate: {
          gte: new Date(now - MATCH_DURATION_MS),
          lte: new Date(now + 5 * 60000),
        },
      },
    });

    let shouldSync = false;

    const fail = this.consecutiveFailures;
    const liveInterval = Math.min(120 + fail * 60, 600);
    const nearInterval = 60;
    const idleInterval = 1800;

    if (hasLiveMatches && secondsSinceLastSync >= liveInterval) {
      shouldSync = true;
    } else if (nearMatch > 0 && !hasLiveMatches && secondsSinceLastSync >= nearInterval) {
      shouldSync = true;
    } else if (!hasLiveMatches && secondsSinceLastSync >= idleInterval) {
      shouldSync = true;
    }

    if (!shouldSync) return;

    this.isSyncing = true;
    try {
      await this.syncResults();
      this.consecutiveFailures = 0;
    } catch (err) {
      this.consecutiveFailures++;
      const backoffMs = Math.min(this.consecutiveFailures, 6) * 60_000;
      this.logger.error(`API falhou (${this.consecutiveFailures}x consecutiva): ${err.message}. Backoff: ${backoffMs / 1000}s`);
      this.lastResultsSync = new Date(Date.now() - idleInterval * 1000 + backoffMs);
    } finally {
      this.isSyncing = false;
    }
  }

  @Cron('0 */6 * * *')
  async handleCronFullSync() {
    if (this.isSyncing) {
      this.logger.warn('CRON sync completo ignorado — sync em andamento');
      return;
    }
    this.isSyncing = true;
    this.logger.log('CRON: sincronização completa...');
    try {
      await this.syncAll();
    } catch (err) {
      this.logger.error('CRON sync completo falhou:', err.message);
    } finally {
      this.isSyncing = false;
    }
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
      authenticated: false,
      lastFullSync: this.lastFullSync?.toISOString() ?? null,
      lastResultsSync: this.lastResultsSync?.toISOString() ?? null,
      totals: { matches: matchCount, predictions: predictionCount, users: userCount },
      apiTotals,
    };
  }

  private parsePhase(apiType: string): string {
    return PHASE_MAP[apiType] || apiType;
  }

  private mapStatus(finished: string, matchDate: Date): MatchStatus {
    if (finished === 'TRUE') return MatchStatus.FINISHED;
    if (matchDate <= new Date()) return MatchStatus.IN_PROGRESS;
    return MatchStatus.SCHEDULED;
  }

  private parseLocalDate(dateStr: string, venueUtcOffsetHours?: number): Date | null {
    if (!dateStr) return null;
    const [datePart, timePart] = dateStr.split(' ');
    if (!datePart) return null;
    const [month, day, year] = datePart.split('/');
    if (!month || !day || !year) return null;
    const hours = +(timePart ? timePart.split(':')[0] : '0');
    const minutes = +(timePart ? timePart.split(':')[1] : '0');

    if (venueUtcOffsetHours !== undefined) {
      const utcHours = hours - venueUtcOffsetHours;
      return new Date(Date.UTC(+year, +month - 1, +day, utcHours, minutes));
    }

    return new Date(Date.UTC(+year, +month - 1, +day, hours, minutes));
  }

  private parseScore(score: string | number | null | undefined): number {
    if (score === null || score === undefined) return 0;
    if (typeof score === 'number') return score;
    const parsed = parseInt(score, 10);
    return isNaN(parsed) ? 0 : parsed;
  }
}
