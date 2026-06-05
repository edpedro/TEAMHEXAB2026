import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Delete,
} from '@nestjs/common';
import { TopScorersService } from './top-scorers.service';
import { CreateTopScorerDto } from './dto/create-top-scorer.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('top-scorers')
@UseGuards(JwtAuthGuard)
export class TopScorersController {
  constructor(private topScorersService: TopScorersService) {}

  @Get('my')
  getMyPrediction(@CurrentUser('id') userId: string) {
    return this.topScorersService.findByUser(userId);
  }

  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTopScorerDto,
  ) {
    return this.topScorersService.create(userId, dto);
  }

  @Patch()
  update(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTopScorerDto,
  ) {
    return this.topScorersService.update(userId, dto);
  }

  @Delete()
  remove(@CurrentUser('id') userId: string) {
    return this.topScorersService.remove(userId);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  findAll() {
    return this.topScorersService.findAll();
  }
}
