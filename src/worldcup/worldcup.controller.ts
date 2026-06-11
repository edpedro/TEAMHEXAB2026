import { Controller, Get } from '@nestjs/common';
import { FootballApiService } from '../football-api/football-api.service';
import { getTeamInfo } from '../football-api/dto/team-mapping';

const PHASE_MAP: Record<string, string> = {
  group: 'group',
  r32: 'r32',
  r16: 'r16',
  qf: 'qf',
  sf: 'sf',
  third: 'third',
  final: 'final',
};

@Controller('worldcup')
export class WorldcupController {
  constructor(private api: FootballApiService) {}

  @Get()
  async getWorldCupData() {
    const [games, teams, groups] = await Promise.all([
      this.api.fetchMatches(),
      this.api.fetchTeams(),
      this.api.fetchGroups(),
    ]);

    const teamMap = new Map<string, { name: string; flag: string; iso2: string; teamId: string }>();
    for (const t of teams) {
      const info = getTeamInfo(t.name_en);
      teamMap.set(t.id, { ...info, teamId: t.id });
    }

    const groupMatches: Record<string, any[]> = {};
    const knockoutMatches: any[] = [];

    for (const game of games) {
      const isKnockout = game.type !== 'group';
      const type = PHASE_MAP[game.type] || game.type;

      const homeInfo = game.home_team_name_en
        ? getTeamInfo(game.home_team_name_en)
        : null;
      const awayInfo = game.away_team_name_en
        ? getTeamInfo(game.away_team_name_en)
        : null;

      const matchObj = {
        id: game.id,
        homeTeam: homeInfo?.name ?? null,
        awayTeam: awayInfo?.name ?? null,
        homeTeamId: game.home_team_id !== '0' ? game.home_team_id : null,
        awayTeamId: game.away_team_id !== '0' ? game.away_team_id : null,
        homeTeamFlag: homeInfo?.flag ?? null,
        awayTeamFlag: awayInfo?.flag ?? null,
        homeTeamIso: homeInfo?.iso2 ?? null,
        awayTeamIso: awayInfo?.iso2 ?? null,
        homeScore: game.finished === 'TRUE' ? parseInt(game.home_score, 10) : null,
        awayScore: game.finished === 'TRUE' ? parseInt(game.away_score, 10) : null,
        date: game.local_date,
        group: game.group,
        matchday: parseInt(game.matchday, 10) || 0,
        type,
        round: type,
        homeLabel: game.home_team_label ?? null,
        awayLabel: game.away_team_label ?? null,
        matchNumber: parseInt(game.id, 10),
        status: game.finished === 'TRUE' ? 'FINISHED' as const : 'SCHEDULED' as const,
      };

      if (isKnockout) {
        knockoutMatches.push(matchObj);
      } else {
        const g = game.group;
        if (!groupMatches[g]) groupMatches[g] = [];
        groupMatches[g].push(matchObj);
      }
    }

    const groupsData = groups.map((g) => {
      const standings = (g.teams || []).map((s) => {
        const team = teamMap.get(s.team_id);
        return {
          teamId: s.team_id,
          name: team?.name ?? `Time #${s.team_id}`,
          flag: team?.flag ?? null,
          iso2: team?.iso2 ?? null,
          mp: parseInt(s.mp, 10) || 0,
          w: parseInt(s.w, 10) || 0,
          l: parseInt(s.l, 10) || 0,
          d: parseInt(s.d, 10) || 0,
          pts: parseInt(s.pts, 10) || 0,
          gf: parseInt(s.gf, 10) || 0,
          ga: parseInt(s.ga, 10) || 0,
          gd: parseInt(s.gd, 10) || 0,
        };
      });

      return {
        name: g.name,
        matches: (groupMatches[g.name] || []).sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        ),
        standings,
      };
    });

    return {
      groups: groupsData,
      knockout: knockoutMatches.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      ),
    };
  }
}
