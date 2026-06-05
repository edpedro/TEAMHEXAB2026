import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { FootballApiService } from './football-api.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('football-api')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class FootballApiController {
  constructor(private api: FootballApiService) {}

  @Get('status')
  status() {
    return this.api.getStatus();
  }

  @Post('sync')
  syncAll() {
    return this.api.syncAll();
  }

  @Post('sync/results')
  syncResults() {
    return this.api.syncResults();
  }

  @Get('teams')
  fetchTeams() {
    return this.api.fetchTeams();
  }

  @Get('matches')
  fetchMatches() {
    return this.api.fetchMatches();
  }

  @Get('groups')
  fetchGroups() {
    return this.api.fetchGroups();
  }

  @Get('stadiums')
  fetchStadiums() {
    return this.api.fetchStadiums();
  }
}
