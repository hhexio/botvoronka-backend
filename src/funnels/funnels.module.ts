import { Module } from '@nestjs/common';
import { FunnelsController } from './funnels.controller';
import { FunnelsService } from './funnels.service';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [TelegramModule],
  controllers: [FunnelsController],
  providers: [FunnelsService],
  exports: [FunnelsService],
})
export class FunnelsModule {}
