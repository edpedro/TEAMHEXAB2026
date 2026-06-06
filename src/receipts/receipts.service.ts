import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class ReceiptsService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    userId: string;
    filePath: string;
    fileName: string;
    mimeType: string;
    notes?: string;
  }) {
    return this.prisma.paymentReceipt.create({
      data: {
        userId: data.userId,
        filePath: data.filePath,
        fileName: data.fileName,
        mimeType: data.mimeType,
        notes: data.notes,
        status: 'PENDING',
      },
    });
  }

  async findByUser(userId: string) {
    return this.prisma.paymentReceipt.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const receipt = await this.prisma.paymentReceipt.findUnique({
      where: { id },
      include: { user: { select: { id: true, fullName: true, username: true } } },
    });
    if (!receipt) throw new NotFoundException('Comprovante não encontrado');
    return receipt;
  }

  async findAll() {
    return this.prisma.paymentReceipt.findMany({
      include: { user: { select: { id: true, fullName: true, username: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approve(id: string, adminNotes?: string) {
    const receipt = await this.findById(id);

    await this.prisma.paymentReceipt.update({
      where: { id },
      data: { status: 'APPROVED', adminNotes },
    });

    await this.prisma.user.update({
      where: { id: receipt.userId },
      data: { hasPaid: true, paidAt: new Date() },
    });

    return this.findById(id);
  }

  async reject(id: string, adminNotes?: string) {
    const receipt = await this.findById(id);

    await this.prisma.paymentReceipt.update({
      where: { id },
      data: { status: 'REJECTED', adminNotes },
    });

    return this.findById(id);
  }
}
