import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { Role } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

async findAll() {
    return this.prisma.user.findMany({
      select: { id: true, fullName: true, username: true, role: true, isActive: true, hasPaid: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, fullName: true, username: true, role: true, isActive: true, hasPaid: true, createdAt: true,
        _count: { select: { predictions: true, userAchievements: true } },
      },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return this.prisma.user.update({
      where: { id }, data: dto,
      select: { id: true, fullName: true, username: true, role: true, isActive: true, hasPaid: true },
    });
  }

  async changeRole(id: string, newRole: Role, currentUserId: string) {
    if (id === currentUserId) {
      throw new BadRequestException('Não é possível alterar seu próprio perfil de administrador');
    }
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (user.role === 'ADMIN' && newRole === 'USER') {
      const adminCount = await this.prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
      if (adminCount <= 1) {
        throw new BadRequestException('Não é possível remover o último administrador');
      }
    }
    return this.prisma.user.update({
      where: { id }, data: { role: newRole },
      select: { id: true, fullName: true, username: true, role: true, isActive: true, hasPaid: true },
    });
  }

  async toggleActive(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return this.prisma.user.update({
      where: { id }, data: { isActive: !user.isActive },
      select: { id: true, fullName: true, username: true, isActive: true, hasPaid: true },
    });
  }

  async togglePayment(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    const newHasPaid = !user.hasPaid;
    return this.prisma.user.update({
      where: { id },
      data: { hasPaid: newHasPaid, paidAt: newHasPaid ? new Date() : null },
      select: { id: true, fullName: true, username: true, isActive: true, hasPaid: true, paidAt: true },
    });
  }

  async updateMyName(userId: string, fullName: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return this.prisma.user.update({
      where: { id: userId },
      data: { fullName },
      select: { id: true, fullName: true, username: true, role: true, isActive: true, hasPaid: true },
    });
  }

  async remove(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    await this.prisma.user.delete({ where: { id } });
    return { message: 'Usuário removido com sucesso' };
  }
}
