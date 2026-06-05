import { IsInt, Min } from 'class-validator';

export class UpdatePredictionDto {
  @IsInt()
  @Min(0)
  predictedHome: number;

  @IsInt()
  @Min(0)
  predictedAway: number;
}
