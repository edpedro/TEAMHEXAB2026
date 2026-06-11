export interface WcTeam {
  _id?: string;
  id: string;
  name_en: string;
  name_fa: string;
  fifa_code: string;
  groups: string;
  flag: string;
  iso2?: string;
}

export interface WcMatch {
  _id?: string;
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_score: string;
  away_score: string;
  home_team_name_en?: string;
  home_team_name_fa?: string;
  away_team_name_en?: string;
  away_team_name_fa?: string;
  home_scorers: string | null;
  away_scorers: string | null;
  group: string;
  matchday: string;
  local_date: string;
  persian_date: string;
  stadium_id: string;
  finished: string;
  time_elapsed: string;
  type: string;
  home_team_label: string;
  away_team_label: string;
}

export interface WcTeamsResponse {
  teams: WcTeam[];
}

export interface WcGamesResponse {
  games: WcMatch[];
}

export interface WcStadium {
  _id?: string;
  id: string;
  name_en: string;
  name_fa: string;
  fifa_name: string;
  city_en: string;
  city_fa?: string;
  country_en: string;
  country_fa?: string;
  capacity: number;
  region?: string;
}

export interface WcStadiumsResponse {
  stadiums: WcStadium[];
}

export interface WcTeamStanding {
  team_id: string;
  mp: string;
  w: string;
  l: string;
  d: string;
  pts: string;
  gf: string;
  ga: string;
  gd: string;
}

export interface WcGroup {
  _id?: string;
  name: string;
  teams?: WcTeamStanding[];
  createdAt?: string;
  __v?: number;
}

export interface WcGroupsResponse {
  groups: WcGroup[];
}

export interface WcAuthResponse {
  user: {
    _id: string;
    name: string;
    email: string;
    createdAt?: string;
  };
  token: string;
}

export interface SyncStatus {
  apiConnected: boolean;
  authenticated: boolean;
  lastFullSync: string | null;
  lastResultsSync: string | null;
  totals: {
    matches: number;
    predictions: number;
    users: number;
  };
  apiTotals: {
    teams: number;
    matches: number;
    stadiums: number;
    groups: number;
  };
}
