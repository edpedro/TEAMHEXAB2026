import { IsString, IsNotEmpty, MaxLength, ArrayMaxSize, ArrayMinSize, ArrayUnique } from 'class-validator';

export class CreateTopScorerDto {
  @ArrayMinSize(5, { message: 'Você deve selecionar exatamente 5 jogadores' })
  @ArrayMaxSize(5, { message: 'Você deve selecionar exatamente 5 jogadores' })
  @ArrayUnique({ message: 'Os jogadores não podem se repetir' })
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(150, { each: true })
  players: string[];
}
