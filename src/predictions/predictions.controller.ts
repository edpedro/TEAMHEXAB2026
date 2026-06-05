import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PredictionsService } from './predictions.service';
import { CreatePredictionDto } from './dto/create-prediction.dto';
import { UpdatePredictionDto } from './dto/update-prediction.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('predictions')
@UseGuards(JwtAuthGuard)
export class PredictionsController {
  constructor(private predictionsService: PredictionsService) {}

  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePredictionDto,
  ) {
    return this.predictionsService.create(userId, dto);
  }

  @Get()
  findByUser(
    @CurrentUser('id') userId: string,
    @Query('matchId') matchId?: string,
  ) {
    return this.predictionsService.findByUser(userId, matchId);
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePredictionDto,
  ) {
    return this.predictionsService.update(userId, id, dto);
  }
}
