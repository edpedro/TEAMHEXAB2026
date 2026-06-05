import { IsString, IsNotEmpty, IsDateString, IsOptional, IsUrl, MaxLength } from 'class-validator';

export class CreateMatchDto {
  @IsString()
  @IsNotEmpty()
  teamHome: string;

  @IsString()
  @IsNotEmpty()
  teamAway: string;

  @IsDateString()
  matchDate: string;

  @IsString()
  @IsOptional()
  phase?: string;

  @IsString()
  @IsOptional()
  @MaxLength(10)
  teamHomeIso?: string;

  @IsString()
  @IsOptional()
  @MaxLength(10)
  teamAwayIso?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  flagHome?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  flagAway?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  stadium?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  city?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  country?: string;

  @IsString()
  @IsOptional()
  @MaxLength(5)
  groupLabel?: string;
}
