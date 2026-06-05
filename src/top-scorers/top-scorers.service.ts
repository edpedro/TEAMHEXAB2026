import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateTopScorerDto } from './dto/create-top-scorer.dto';

@Injectable()
export class TopScorersService {
  constructor(private prisma: PrismaService) {}

  async findByUser(userId: string) {
    const prediction = await this.prisma.topScorerPrediction.findUnique({
      where: { userId },
    });

    if (!prediction) {
      return null;
    }

    return {
      id: prediction.id,
      players: [
        prediction.player1,
        prediction.player2,
        prediction.player3,
        prediction.player4,
        prediction.player5,
      ],
      createdAt: prediction.createdAt,
      updatedAt: prediction.updatedAt,
    };
  }

  async create(userId: string, dto: CreateTopScorerDto) {
    const existing = await this.prisma.topScorerPrediction.findUnique({
      where: { userId },
    });

    if (existing) {
      throw new ConflictException('Você já possui um palpite de artilheiros. Use PATCH para editar.');
    }

    await this.validateDeadline();

    const prediction = await this.prisma.topScorerPrediction.create({
      data: {
        userId,
        player1: dto.players[0],
        player2: dto.players[1],
        player3: dto.players[2],
        player4: dto.players[3],
        player5: dto.players[4],
      },
    });

    return {
      id: prediction.id,
      players: [
        prediction.player1,
        prediction.player2,
        prediction.player3,
        prediction.player4,
        prediction.player5,
      ],
      createdAt: prediction.createdAt,
      updatedAt: prediction.updatedAt,
    };
  }

  async update(userId: string, dto: CreateTopScorerDto) {
    const existing = await this.prisma.topScorerPrediction.findUnique({
      where: { userId },
    });

    if (!existing) {
      throw new NotFoundException('Nenhum palpite de artilheiros encontrado. Crie um primeiro.');
    }

    await this.validateDeadline();

    const prediction = await this.prisma.topScorerPrediction.update({
      where: { userId },
      data: {
        player1: dto.players[0],
        player2: dto.players[1],
        player3: dto.players[2],
        player4: dto.players[3],
        player5: dto.players[4],
      },
    });

    return {
      id: prediction.id,
      players: [
        prediction.player1,
        prediction.player2,
        prediction.player3,
        prediction.player4,
        prediction.player5,
      ],
      updatedAt: prediction.updatedAt,
    };
  }

  async remove(userId: string) {
    const existing = await this.prisma.topScorerPrediction.findUnique({
      where: { userId },
    });

    if (!existing) {
      throw new NotFoundException('Nenhum palpite de artilheiros encontrado.');
    }

    await this.prisma.topScorerPrediction.delete({ where: { userId } });

    return { message: 'Palpite de artilheiros removido com sucesso' };
  }

  async findAll() {
    const predictions = await this.prisma.topScorerPrediction.findMany({
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            username: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return predictions.map((p) => ({
      id: p.id,
      user: p.user,
      players: [p.player1, p.player2, p.player3, p.player4, p.player5],
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  }

  private async validateDeadline() {
    const config = await this.prisma.systemConfig.findFirst();
    if (config?.betDeadline && new Date() > config.betDeadline) {
      throw new BadRequestException('O prazo para palpites de artilheiros já expirou.');
    }
  }
}
