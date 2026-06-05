/**
 * Estádios da Copa do Mundo 2026 com nomes traduzidos para PT-BR
 * Mantido manualmente para garantir nomes apropriados em PT-BR.
 *
 * Chave: stadium_id (string) retornado pela API
 * Valor: { name: nome do estádio, city: cidade, country: país, capacity }
 */
export interface StadiumInfo {
  name: string;
  city: string;
  country: string;
  capacity: number;
}

export const STADIUM_PT_MAP: Record<string, StadiumInfo> = {
  '1': { name: 'Estádio Azteca', city: 'Cidade do México', country: 'México', capacity: 83000 },
  '2': { name: 'Estádio Akron', city: 'Guadalajara', country: 'México', capacity: 48000 },
  '3': { name: 'Estádio BBVA', city: 'Monterrey', country: 'México', capacity: 53500 },
  '4': { name: 'AT&T Stadium', city: 'Dallas', country: 'Estados Unidos', capacity: 94000 },
  '5': { name: 'NRG Stadium', city: 'Houston', country: 'Estados Unidos', capacity: 72000 },
  '6': { name: 'GEHA Field at Arrowhead Stadium', city: 'Kansas City', country: 'Estados Unidos', capacity: 73000 },
  '7': { name: 'Mercedes-Benz Stadium', city: 'Atlanta', country: 'Estados Unidos', capacity: 75000 },
  '8': { name: 'Hard Rock Stadium', city: 'Miami', country: 'Estados Unidos', capacity: 65000 },
  '9': { name: 'Gillette Stadium', city: 'Boston', country: 'Estados Unidos', capacity: 65000 },
  '10': { name: 'Lincoln Financial Field', city: 'Filadélfia', country: 'Estados Unidos', capacity: 69000 },
  '11': { name: 'MetLife Stadium', city: 'Nova York/Nova Jersey', country: 'Estados Unidos', capacity: 82500 },
  '12': { name: 'BMO Field', city: 'Toronto', country: 'Canadá', capacity: 45000 },
  '13': { name: 'BC Place', city: 'Vancouver', country: 'Canadá', capacity: 54000 },
  '14': { name: 'Lumen Field', city: 'Seattle', country: 'Estados Unidos', capacity: 69000 },
  '15': { name: "Levi's Stadium", city: 'São Francisco', country: 'Estados Unidos', capacity: 71000 },
  '16': { name: 'SoFi Stadium', city: 'Los Angeles', country: 'Estados Unidos', capacity: 70000 },
};

export function getStadiumInfo(id: string | null | undefined): StadiumInfo | null {
  if (!id) return null;
  return STADIUM_PT_MAP[id] ?? null;
}
