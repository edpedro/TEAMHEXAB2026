import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { FootballApiController } from './football-api.controller';
import { SeedController } from './seed.controller';
import { FootballApiService } from './football-api.service';

@Module({
  imports: [AdminModule],
  controllers: [FootballApiController, SeedController],
  providers: [FootballApiService],
  exports: [FootballApiService],
})
export class FootballApiModule {}
