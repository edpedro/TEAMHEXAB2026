import { Module } from '@nestjs/common';
import { TopScorersController } from './top-scorers.controller';
import { TopScorersService } from './top-scorers.service';

@Module({
  controllers: [TopScorersController],
  providers: [TopScorersService],
  exports: [TopScorersService],
})
export class TopScorersModule {}
