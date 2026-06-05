import { IsString, MinLength } from 'class-validator';

export class UpdateNameDto {
  @IsString()
  @MinLength(1)
  fullName: string;
}
