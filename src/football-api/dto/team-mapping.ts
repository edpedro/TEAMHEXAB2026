/**
 * Mapeamento de times da Copa 2026 em Português (Brasil)
 * Mantido manualmente para garantir nomes apropriados em PT-BR.
 *
 * Chave: nome em inglês retornado pela API worldcup26.ir
 * Valor: { pt: nome em português, iso2: código ISO-3166-1 alpha-2 }
 */
export interface TeamInfo {
  pt: string;
  iso2: string;
}

export const TEAM_PT_MAP: Record<string, TeamInfo> = {
  'Mexico': { pt: 'México', iso2: 'mx' },
  'South Africa': { pt: 'África do Sul', iso2: 'za' },
  'South Korea': { pt: 'Coreia do Sul', iso2: 'kr' },
  'Czech Republic': { pt: 'República Tcheca', iso2: 'cz' },
  'Canada': { pt: 'Canadá', iso2: 'ca' },
  'Bosnia and Herzegovina': { pt: 'Bósnia e Herzegovina', iso2: 'ba' },
  'Qatar': { pt: 'Catar', iso2: 'qa' },
  'Switzerland': { pt: 'Suíça', iso2: 'ch' },
  'Brazil': { pt: 'Brasil', iso2: 'br' },
  'Morocco': { pt: 'Marrocos', iso2: 'ma' },
  'Haiti': { pt: 'Haiti', iso2: 'ht' },
  'Scotland': { pt: 'Escócia', iso2: 'gb-sct' },
  'United States': { pt: 'Estados Unidos', iso2: 'us' },
  'Paraguay': { pt: 'Paraguai', iso2: 'py' },
  'Australia': { pt: 'Austrália', iso2: 'au' },
  'Turkey': { pt: 'Turquia', iso2: 'tr' },
  'Germany': { pt: 'Alemanha', iso2: 'de' },
  'Curaçao': { pt: 'Curaçao', iso2: 'cw' },
  'Ivory Coast': { pt: 'Costa do Marfim', iso2: 'ci' },
  'Ecuador': { pt: 'Equador', iso2: 'ec' },
  'Netherlands': { pt: 'Holanda', iso2: 'nl' },
  'Japan': { pt: 'Japão', iso2: 'jp' },
  'Sweden': { pt: 'Suécia', iso2: 'se' },
  'Tunisia': { pt: 'Tunísia', iso2: 'tn' },
  'Belgium': { pt: 'Bélgica', iso2: 'be' },
  'Egypt': { pt: 'Egito', iso2: 'eg' },
  'Iran': { pt: 'Irã', iso2: 'ir' },
  'New Zealand': { pt: 'Nova Zelândia', iso2: 'nz' },
  'Spain': { pt: 'Espanha', iso2: 'es' },
  'Cape Verde': { pt: 'Cabo Verde', iso2: 'cv' },
  'Saudi Arabia': { pt: 'Arábia Saudita', iso2: 'sa' },
  'Uruguay': { pt: 'Uruguai', iso2: 'uy' },
  'France': { pt: 'França', iso2: 'fr' },
  'Senegal': { pt: 'Senegal', iso2: 'sn' },
  'Iraq': { pt: 'Iraque', iso2: 'iq' },
  'Norway': { pt: 'Noruega', iso2: 'no' },
  'Argentina': { pt: 'Argentina', iso2: 'ar' },
  'Algeria': { pt: 'Argélia', iso2: 'dz' },
  'Austria': { pt: 'Áustria', iso2: 'at' },
  'Jordan': { pt: 'Jordânia', iso2: 'jo' },
  'Portugal': { pt: 'Portugal', iso2: 'pt' },
  'Democratic Republic of the Congo': { pt: 'República Democrática do Congo', iso2: 'cd' },
  'Uzbekistan': { pt: 'Uzbequistão', iso2: 'uz' },
  'Colombia': { pt: 'Colômbia', iso2: 'co' },
  'England': { pt: 'Inglaterra', iso2: 'gb-eng' },
  'Croatia': { pt: 'Croácia', iso2: 'hr' },
  'Ghana': { pt: 'Gana', iso2: 'gh' },
  'Panama': { pt: 'Panamá', iso2: 'pa' },
};

/**
 * Retorna o nome em português, bandeira e ISO de um time a partir do nome em inglês.
 * Se não estiver no mapa, usa o próprio nome em inglês e bandeira genérica.
 */
export function getTeamInfo(enName: string | null | undefined): {
  name: string;
  flag: string;
  iso2: string;
} {
  if (!enName) {
    return { name: 'A definir', flag: '', iso2: '' };
  }
  const info = TEAM_PT_MAP[enName];
  if (info) {
    return {
      name: info.pt,
      flag: `https://flagcdn.com/w160/${info.iso2}.png`,
      iso2: info.iso2,
    };
  }
  return {
    name: enName,
    flag: '',
    iso2: '',
  };
}
