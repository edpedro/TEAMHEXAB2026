import { IsString, IsOptional, IsDateString, IsInt, IsEnum, MaxLength } from 'class-validator';
import { MatchStatus } from '@prisma/client';

export class UpdateMatchDto {
  @IsString()
  @IsOptional()
  teamHome?: string;

  @IsString()
  @IsOptional()
  teamAway?: string;

  @IsDateString()
  @IsOptional()
  matchDate?: string;

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

  @IsInt()
  @IsOptional()
  homeScore?: number;

  @IsInt()
  @IsOptional()
  awayScore?: number;

  @IsEnum(MatchStatus)
  @IsOptional()
  status?: MatchStatus;
}
