import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// @Global means we do not need to import PrismaModule
// in every feature module — it is available everywhere
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
