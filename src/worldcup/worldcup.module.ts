import { Module } from '@nestjs/common';
import { WorldcupController } from './worldcup.controller';
import { FootballApiModule } from '../football-api/football-api.module';

@Module({
  imports: [FootballApiModule],
  controllers: [WorldcupController],
})
export class WorldcupModule {}
