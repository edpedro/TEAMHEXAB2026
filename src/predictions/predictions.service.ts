import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreatePredictionDto } from './dto/create-prediction.dto';
import { UpdatePredictionDto } from './dto/update-prediction.dto';

export const PREDICTION_LOCK_HOURS = 30;

@Injectable()
export class PredictionsService {
  constructor(private prisma: PrismaService) {}

  private getLockDeadline(matchDate: Date): Date {
    return new Date(matchDate.getTime() - PREDICTION_LOCK_HOURS * 60 * 60 * 1000);
  }

  async create(userId: string, dto: CreatePredictionDto) {
    const match = await this.prisma.match.findUnique({
      where: { id: dto.matchId },
    });

    if (!match) {
      throw new NotFoundException('Partida não encontrada');
    }

    const lockDeadline = this.getLockDeadline(match.matchDate);
    if (new Date() >= lockDeadline) {
      throw new ForbiddenException(
        `Palpites encerrados para esta partida. O prazo final era ${lockDeadline.toLocaleString('pt-BR')} (${PREDICTION_LOCK_HOURS}h antes do jogo).`,
      );
    }

    const existing = await this.prisma.prediction.findUnique({
      where: {
        userId_matchId: {
          userId,
          matchId: dto.matchId,
        },
      },
    });

    if (existing) {
      throw new ForbiddenException('Você já palpitou nesta partida');
    }

    return this.prisma.prediction.create({
      data: {
        userId,
        matchId: dto.matchId,
        predictedHome: dto.predictedHome,
        predictedAway: dto.predictedAway,
      },
      include: {
        match: {
          select: {
            teamHome: true,
            teamAway: true,
            teamHomeIso: true,
            teamAwayIso: true,
            flagHome: true,
            flagAway: true,
            stadium: true,
            city: true,
            matchDate: true,
            phase: true,
          },
        },
      },
    });
  }

  async findByUser(userId: string, matchId?: string) {
    const where: any = { userId };

    if (matchId) where.matchId = matchId;

    return this.prisma.prediction.findMany({
      where,
      include: {
        match: {
          select: {
            id: true,
            teamHome: true,
            teamAway: true,
            teamHomeIso: true,
            teamAwayIso: true,
            flagHome: true,
            flagAway: true,
            stadium: true,
            city: true,
            matchDate: true,
            homeScore: true,
            awayScore: true,
            status: true,
            phase: true,
            groupLabel: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(userId: string, predictionId: string, dto: UpdatePredictionDto) {
    const prediction = await this.prisma.prediction.findUnique({
      where: { id: predictionId },
      include: { match: true },
    });

    if (!prediction) {
      throw new NotFoundException('Palpite não encontrado');
    }

    if (prediction.userId !== userId) {
      throw new ForbiddenException('Este palpite não pertence a você');
    }

    const lockDeadline = this.getLockDeadline(prediction.match.matchDate);
    if (new Date() >= lockDeadline) {
      throw new ForbiddenException(
        `Prazo encerrado para alterar o palpite (${PREDICTION_LOCK_HOURS}h antes do jogo).`,
      );
    }

    return this.prisma.prediction.update({
      where: { id: predictionId },
      data: {
        predictedHome: dto.predictedHome,
        predictedAway: dto.predictedAway,
      },
      include: {
        match: {
          select: {
            teamHome: true,
            teamAway: true,
            teamHomeIso: true,
            teamAwayIso: true,
            flagHome: true,
            flagAway: true,
            stadium: true,
            city: true,
            matchDate: true,
          },
        },
      },
    });
  }
}
