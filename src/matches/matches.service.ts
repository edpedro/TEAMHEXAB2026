import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateMatchDto } from './dto/create-match.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { MatchStatus } from '@prisma/client';

@Injectable()
export class MatchesService {
  constructor(private prisma: PrismaService) {}

  async findAll(phase?: string, status?: MatchStatus) {
    const where: any = {};

    if (phase) where.phase = phase;
    if (status) where.status = status;

    return this.prisma.match.findMany({
      where,
      orderBy: { matchDate: 'asc' },
    });
  }

  async findById(id: string) {
    const match = await this.prisma.match.findUnique({
      where: { id },
      include: {
        predictions: {
          select: {
            id: true,
            predictedHome: true,
            predictedAway: true,
            pointsEarned: true,
            user: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
      },
    });

    if (!match) {
      throw new NotFoundException('Partida não encontrada');
    }

    return match;
  }

  async create(dto: CreateMatchDto) {
    return this.prisma.match.create({ data: dto });
  }

  async update(id: string, dto: UpdateMatchDto) {
    const match = await this.prisma.match.findUnique({ where: { id } });

    if (!match) {
      throw new NotFoundException('Partida não encontrada');
    }

    return this.prisma.match.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const match = await this.prisma.match.findUnique({ where: { id } });

    if (!match) {
      throw new NotFoundException('Partida não encontrada');
    }

    await this.prisma.match.delete({ where: { id } });
    return { message: 'Partida removida com sucesso' };
  }

  async getUpcoming(limit = 5) {
    return this.prisma.match.findMany({
      where: {
        status: MatchStatus.SCHEDULED,
        matchDate: { gte: new Date() },
      },
      orderBy: { matchDate: 'asc' },
      take: limit,
    });
  }

  async getRecentResults(limit = 5) {
    return this.prisma.match.findMany({
      where: { status: MatchStatus.FINISHED },
      orderBy: { matchDate: 'desc' },
      take: limit,
    });
  }
}
