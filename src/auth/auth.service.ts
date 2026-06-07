import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../common/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });

    if (existing) {
      throw new ConflictException('Nome de usuário já está em uso');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        username: dto.username,
        passwordHash,
      },
    });

    return this.generateTokens(user.id, user.username, user.role);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordValid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (user.isTempPassword) {
      return {
        needsNewPassword: true,
        userId: user.id,
        username: user.username,
      };
    }

    return this.generateTokens(user.id, user.username, user.role);
  }

  async setNewPassword(userId: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    if (!user.isTempPassword) {
      throw new BadRequestException('Usuário não possui senha temporária');
    }

    const isSameAsTemp = await bcrypt.compare(newPassword, user.passwordHash);
    if (isSameAsTemp) {
      throw new BadRequestException('A nova senha deve ser diferente da senha temporária');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        isTempPassword: false,
      },
    });

    return { message: 'Senha alterada com sucesso! Faça login novamente com sua nova senha.' };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, role: true, fullName: true, hasPaid: true, isActive: true },
    });
    if (!user) throw new UnauthorizedException('Usuário não encontrado');
    return user;
  }

  async refreshToken(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw new UnauthorizedException('Usuário não encontrado ou inativo');
    return this.generateTokens(user.id, user.username, user.role);
  }

  private async generateTokens(userId: string, username: string, role: string) {
    const payload = { sub: userId, username, role };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRATION', '3650d'),
    });
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { hasPaid: true, fullName: true },
    });
    return {
      accessToken,
      refreshToken,
      user: { id: userId, username, role, hasPaid: user?.hasPaid ?? false, fullName: user?.fullName ?? null },
    };
  }
}
