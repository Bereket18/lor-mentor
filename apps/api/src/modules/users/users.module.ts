import { Module } from '@nestjs/common';
import { UsersService } from './users.service';

@Module({
  providers: [UsersService],
  // exports makes UsersService available to other modules
  // Without this AuthModule cannot use UsersService
  exports: [UsersService],
})
export class UsersModule {}
