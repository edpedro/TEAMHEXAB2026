import { IsString, IsInt, IsNotEmpty, Min } from 'class-validator';

export class CreatePredictionDto {
  @IsString()
  @IsNotEmpty()
  matchId: string;

  @IsInt()
  @Min(0)
  predictedHome: number;

  @IsInt()
  @Min(0)
  predictedAway: number;
}
