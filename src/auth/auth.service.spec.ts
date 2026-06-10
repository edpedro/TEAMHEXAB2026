import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../common/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let jwtService: any;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-token'),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      if (key === 'JWT_REFRESH_SECRET') return 'refresh-secret';
      if (key === 'JWT_REFRESH_EXPIRATION') return '3650d';
      return defaultValue;
    }),
  };

  const baseUser = {
    id: 'user-1',
    fullName: 'João Silva',
    username: 'joao',
    passwordHash: '$2a$10$hashedpassword',
    role: 'USER',
    isActive: true,
    isTempPassword: false,
    hasPaid: false,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    const registerDto = { fullName: 'João Silva', username: 'joao', password: 'senha123' };

    it('deve registrar novo usuário e retornar tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(baseUser);

      const result = await service.register(registerDto) as any;

      expect(result.accessToken).toBe('mock-token');
      expect(result.refreshToken).toBe('mock-token');
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          fullName: 'João Silva',
          username: 'joao',
          passwordHash: expect.any(String),
        },
      });
    });

    it('deve lançar ConflictException se username já existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const loginDto = { username: 'joao', password: 'senha123' };

    it('deve autenticar e retornar tokens', async () => {
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);

      const result: any = await service.login(loginDto);

      expect(result.accessToken).toBe('mock-token');
      expect(result.refreshToken).toBe('mock-token');
    });

    it('deve retornar needsNewPassword se for senha temporária', async () => {
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, isTempPassword: true });

      const result = await service.login(loginDto) as any;

      expect(result.needsNewPassword).toBe(true);
      expect(result.accessToken).toBeUndefined();
    });

    it('deve lançar UnauthorizedException se usuário não existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('deve lançar UnauthorizedException se usuário está inativo', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, isActive: false });

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('deve lançar UnauthorizedException se senha inválida', async () => {
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('setNewPassword', () => {
    it('deve alterar senha temporária', async () => {
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, isTempPassword: true });
      mockPrisma.user.update.mockResolvedValue({ ...baseUser, isTempPassword: false });

      const result = await service.setNewPassword('user-1', 'nova-senha-123');

      expect(result.message).toContain('Senha alterada');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: expect.any(String), isTempPassword: false },
      });
    });

    it('deve lançar UnauthorizedException se usuário não existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.setNewPassword('999', 'nova')).rejects.toThrow(UnauthorizedException);
    });

    it('deve lançar BadRequestException se não é senha temporária', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);

      await expect(service.setNewPassword('user-1', 'nova')).rejects.toThrow(BadRequestException);
    });

    it('deve lançar BadRequestException se nova senha igual à temporária', async () => {
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, isTempPassword: true });

      await expect(service.setNewPassword('user-1', 'igual')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getMe', () => {
    it('deve retornar dados do usuário', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);

      const result = await service.getMe('user-1');
      expect(result.id).toBe('user-1');
      expect(result.username).toBe('joao');
    });

    it('deve lançar UnauthorizedException se usuário não existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getMe('999')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshToken', () => {
    it('deve gerar novos tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);

      const result = await service.refreshToken('user-1');
      expect(result.accessToken).toBe('mock-token');
    });

    it('deve lançar UnauthorizedException se usuário inativo', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, isActive: false });

      await expect(service.refreshToken('user-1')).rejects.toThrow(UnauthorizedException);
    });

    it('deve lançar UnauthorizedException se usuário não existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.refreshToken('999')).rejects.toThrow(UnauthorizedException);
    });
  });
});
