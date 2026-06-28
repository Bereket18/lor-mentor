import { Module } from '@nestjs/common';
import { TutorController } from './tutor.controller';
import { TutorService } from './tutor.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [TutorController],
  providers: [TutorService],
})
export class TutorModule {}
