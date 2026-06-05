import { Controller, Get, Post, Query } from '@nestjs/common';
import { FootballApiService } from './football-api.service';

@Controller('seed')
export class SeedController {
  constructor(private api: FootballApiService) {}

  @Get()
  syncAll() {
    return this.api.syncAll();
  }

  @Get('status')
  status() {
    return this.api.getStatus();
  }

  @Post()
  syncAllPost() {
    return this.api.syncAll();
  }

  @Post('results')
  syncResults() {
    return this.api.syncResults();
  }
}
