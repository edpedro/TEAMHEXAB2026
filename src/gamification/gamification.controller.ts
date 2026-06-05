import { Controller, Get, UseGuards } from '@nestjs/common';
import { GamificationService } from './gamification.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('gamification')
@UseGuards(JwtAuthGuard)
export class GamificationController {
  constructor(private gamificationService: GamificationService) {}

  @Get('achievements')
  getAll() {
    return this.gamificationService.getAllAchievements();
  }

  @Get('my-achievements')
  getMyAchievements(@CurrentUser('id') userId: string) {
    return this.gamificationService.getUserAchievements(userId);
  }

  @Get('check')
  checkAchievements(@CurrentUser('id') userId: string) {
    return this.gamificationService.checkAndAwardAchievements(userId);
  }
}
