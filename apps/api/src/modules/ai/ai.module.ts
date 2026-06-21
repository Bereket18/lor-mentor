import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AiProcessor } from './ai.processor';
import { AiService } from './ai.service';
import { GeminiService } from './gemini.service';
import { PdfExtractorService } from './pdf-extractor.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'ai-generation',
      defaultJobOptions: {
        attempts: 3, // retry up to 3 times on failure
        backoff: { type: 'exponential', delay: 5000 }, // waits 5s, 10s, 20s between retries
        removeOnComplete: true, // don't clutter Redis with old finished jobs
        removeOnFail: false, // keep failed jobs visible for debugging
      },
    }),
  ],
  providers: [AiProcessor, AiService, GeminiService, PdfExtractorService],
  exports: [AiService],
})
export class AiModule {}
