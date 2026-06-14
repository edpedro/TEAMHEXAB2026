import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Res,
  UploadedFile,
  UseInterceptors,
  ParseFloatPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('dashboard')
  getDashboard() {
    return this.adminService.getDashboard();
  }

  @Get('financial')
  getFinancial() {
    return this.adminService.getFinancialDashboard();
  }

  @Patch('config/bet-amount')
  updateBetAmount(@Body('amount', ParseFloatPipe) amount: number) {
    return this.adminService.updateBetAmount(amount);
  }

  @Patch('config/pix-key')
  updatePixKey(@Body('pixKey') pixKey: string) {
    return this.adminService.updatePixKey(pixKey);
  }

  @Get('receipts')
  getReceipts() {
    return this.adminService.getReceipts();
  }

  @Post('receipts/:id/approve')
  approveReceipt(@Param('id') id: string, @Body('adminNotes') adminNotes?: string) {
    return this.adminService.approveReceipt(id, adminNotes);
  }

  @Post('receipts/:id/reject')
  rejectReceipt(@Param('id') id: string, @Body('adminNotes') adminNotes?: string) {
    return this.adminService.rejectReceipt(id, adminNotes);
  }

  @Post('users/:id/set-password')
  setPassword(
    @Param('id') userId: string,
    @Body('password') password: string,
  ) {
    return this.adminService.setPassword(userId, password);
  }

  @Post('users/:id/generate-temp-password')
  generateTempPassword(@Param('id') userId: string) {
    return this.adminService.generateTempPassword(userId);
  }

  @Post('matches/:id/result')
  setResult(
    @Param('id') matchId: string,
    @Body('homeScore') homeScore: number,
    @Body('awayScore') awayScore: number,
  ) {
    return this.adminService.setResult(matchId, homeScore, awayScore);
  }

  @Post('matches/reset-finished')
  resetFinished() {
    return this.adminService.resetFinishedMatches();
  }

  @Post('recalculate-scoring')
  recalculateScoring() {
    return this.adminService.recalculateScoring();
  }

  @Post('knockout/unlock')
  unlockKnockout() {
    return this.adminService.unlockKnockout();
  }

  @Get('config')
  getConfig() {
    return this.adminService.getSystemConfig();
  }

  @Patch('config')
  updateConfig(
    @Body()
    data: {
      knockoutEnabled?: boolean;
      bettingEnabled?: boolean;
      betDeadline?: Date;
    },
  ) {
    return this.adminService.updateSystemConfig(data);
  }

  @Get('matches/template')
  downloadTemplate(@Res() res: Response) {
    const buffer = this.adminService.generateExcelTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=modelo-partidas-copa2026.xlsx');
    res.send(buffer);
  }

  @Post('matches/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadMatches(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      return { success: false, message: 'Nenhum arquivo enviado' };
    }
    return this.adminService.processExcelUpload(file.buffer);
  }
}
