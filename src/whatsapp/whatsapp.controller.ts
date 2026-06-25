import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { WhatsappService } from './whatsapp.service';
import { SendTestDto } from './dto/send-test.dto';

@Controller('admin/whatsapp')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(private readonly whatsappService: WhatsappService) {}

  @Get('status')
  async getStatus() {
    const status = this.whatsappService.getStatus();
    const group = await this.whatsappService.getActiveGroup();
    return { ...status, activeGroup: group };
  }

  @Get('qrcode')
  async getQrCode() {
    const qrCode = await this.whatsappService.getQrCode();
    return { qrCode };
  }

  @Post('connect')
  async connect() {
    const status = this.whatsappService.getStatus();
    if (status.status === 'CONNECTED') {
      return { message: 'WhatsApp já está conectado' };
    }
    this.whatsappService.connect().catch((err) => {
      this.logger.error(`Falha ao conectar: ${err.message}`);
    });
    return { message: 'Conectando...' };
  }

  @Post('disconnect')
  async disconnect() {
    await this.whatsappService.disconnect();
    return { message: 'Desconectado' };
  }

  @Get('groups')
  async getGroups() {
    const groups = await this.whatsappService.syncGroups();
    return { groups };
  }

  @Put('group/:groupId')
  async setActiveGroup(@Param('groupId') groupId: string) {
    await this.whatsappService.setActiveGroup(groupId);
    return { message: 'Grupo definido como ativo' };
  }

  @Post('test')
  async sendTest(@Body() dto: SendTestDto) {
    const success = await this.whatsappService.sendTestMessage(dto.message);
    if (success) {
      return { message: 'Mensagem enviada com sucesso' };
    }
    return { message: 'Falha ao enviar mensagem' };
  }

  @Post('check-closing')
  async checkClosing(@Body() dto: { teamHome: string; teamAway: string; matchDate: string; teamHomeIso?: string; teamAwayIso?: string }) {
    const matchDate = new Date(dto.matchDate);
    const success = await this.whatsappService.checkAndSendClosingNotification(
      dto.teamHome,
      dto.teamAway,
      matchDate,
      dto.teamHomeIso,
      dto.teamAwayIso,
    );
    return {
      message: success
        ? `Notificação de fechamento enviada para ${dto.teamHome} x ${dto.teamAway}`
        : 'Falha ao enviar notificação de fechamento',
      sent: success,
    };
  }
}
