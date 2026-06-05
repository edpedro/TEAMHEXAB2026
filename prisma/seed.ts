import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const achievements = [
  { name: 'Primeiro Palpite', description: 'Faça seu primeiro palpite', icon: '🎯' },
  { name: 'Primeiro Acerto', description: 'Acertou o resultado de uma partida', icon: '✅' },
  { name: 'Placar Exato', description: 'Acertou um placar exato (5 pontos)', icon: '🎯' },
  { name: '3 Acertos Seguidos', description: 'Acertou 3 resultados consecutivos', icon: '🔥' },
  { name: '10 Jogos Acertados', description: 'Acertou o resultado de 10 partidas', icon: '💪' },
  { name: 'Participou de Todas as Rodadas', description: 'Palpitou em jogos de todas as rodadas', icon: '📋' },
  { name: 'Top 10 do Ranking', description: 'Ficou entre os 10 melhores do ranking', icon: '🏆' },
  { name: '50 Pontos', description: 'Acumulou 50 pontos no total', icon: '⭐' },
  { name: '100 Pontos', description: 'Acumulou 100 pontos no total', icon: '🌟' },
  { name: 'Bronze', description: '15 acertos simples', icon: '🥉' },
  { name: 'Prata', description: '5 acertos de saldo', icon: '🥈' },
  { name: 'Ouro', description: '3 placares exatos', icon: '🥇' },
];

async function main() {
  const adminHash = await bcrypt.hash('admin123', 10);

  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      fullName: 'Administrador',
      username: 'admin',
      passwordHash: adminHash,
      role: 'ADMIN',
    },
  });

  await prisma.systemConfig.upsert({
    where: { id: (await prisma.systemConfig.findFirst())?.id || 'none' },
    update: {},
    create: {},
  });

  const existingCount = await prisma.achievement.count();
  if (existingCount === 0) {
    await prisma.achievement.createMany({ data: achievements });
  }

  console.log('Seed concluído: admin/admin123 criado, conquistas criadas');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
