import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MatchesService } from './matches.service';
import { CreateMatchDto } from './dto/create-match.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role, MatchStatus } from '@prisma/client';

@Controller('matches')
export class MatchesController {
  constructor(private matchesService: MatchesService) {}

  @Get()
  findAll(
    @Query('phase') phase?: string,
    @Query('status') status?: MatchStatus,
  ) {
    return this.matchesService.findAll(phase, status);
  }

  @Get('upcoming')
  getUpcoming(@Query('limit') limit?: string) {
    return this.matchesService.getUpcoming(limit ? +limit : 5);
  }

  @Get('recent')
  getRecentResults(@Query('limit') limit?: string) {
    return this.matchesService.getRecentResults(limit ? +limit : 5);
  }

  @Get('today')
  getTodayMatches() {
    return this.matchesService.getTodayMatches();
  }

  @Get('live')
  getLiveMatches() {
    return this.matchesService.getLiveMatches();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findById(@Param('id') id: string) {
    return this.matchesService.findById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateMatchDto) {
    return this.matchesService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateMatchDto) {
    return this.matchesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.matchesService.remove(id);
  }
}
