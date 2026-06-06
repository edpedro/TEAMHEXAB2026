import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('config')
@UseGuards(JwtAuthGuard)
export class ConfigController {
  constructor(private adminService: AdminService) {}

  @Get()
  getConfig() {
    return this.adminService.getSystemConfig();
  }
}
