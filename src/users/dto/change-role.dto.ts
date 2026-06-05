import { IsEnum, IsNotEmpty } from 'class-validator';
import { Role } from '@prisma/client';

export class ChangeRoleDto {
  @IsEnum(Role, { message: 'Perfil inválido. Use ADMIN ou USER' })
  @IsNotEmpty()
  role: Role;
}
