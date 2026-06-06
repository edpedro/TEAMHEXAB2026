import { Controller, Get, Post, Body, HttpCode, HttpStatus, UseGuards, BadRequestException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('set-new-password')
  @HttpCode(HttpStatus.OK)
  async setNewPassword(
    @Body('userId') userId: string,
    @Body('newPassword') newPassword: string,
    @Body('confirmPassword') confirmPassword: string,
  ) {
    if (!userId || !newPassword || !confirmPassword) {
      throw new BadRequestException('Todos os campos são obrigatórios');
    }
    if (newPassword !== confirmPassword) {
      throw new BadRequestException('As senhas não conferem');
    }
    if (newPassword.length < 6) {
      throw new BadRequestException('A nova senha deve ter no mínimo 6 caracteres');
    }
    return this.authService.setNewPassword(userId, newPassword);
  }

  @Post('refresh')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async refresh(@CurrentUser('id') userId: string) {
    return this.authService.refreshToken(userId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: any) {
    const fullUser = await this.authService.getMe(user.id);
    return fullUser;
  }
}
