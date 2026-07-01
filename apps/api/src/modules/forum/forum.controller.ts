import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ForumService } from './forum.service';
import { CreatePostDto } from './dto/create-post.dto';
import { CreateReplyDto } from './dto/create-reply.dto';
import { ReactionDto } from './dto/reaction.dto';
import { ReportDto, ResolveReportDto } from './dto/report.dto';

import type { RequestUser } from '../../common/types/request-user';

@Controller('forum')
@UseGuards(JwtAuthGuard)
export class ForumController {
  constructor(private readonly service: ForumService) {}

  // ── Moderation (admin) — declared before :id routes ───────────
  @Get('reports')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  listReports() {
    return this.service.listReports();
  }

  @Patch('reports/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  resolveReport(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: ResolveReportDto,
  ) {
    return this.service.resolveReport(id, dto.action, user.id);
  }

  // ── Threads ───────────────────────────────────────────────────
  @Get('course/:courseId')
  getCourseForum(
    @Param('courseId') courseId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.getCourseForum(courseId, user.id);
  }

  @Get('posts/:id')
  getPost(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.getPost(id, user.id);
  }

  @Post('posts')
  createPost(@CurrentUser() user: RequestUser, @Body() dto: CreatePostDto) {
    return this.service.createPost(user.id, dto);
  }

  @Post('posts/:id/replies')
  createReply(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateReplyDto,
  ) {
    return this.service.createReply(id, user.id, dto);
  }

  @Delete('posts/:id')
  removePost(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.removePost(id, user.id, user.role);
  }

  @Delete('replies/:id')
  removeReply(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.removeReply(id, user.id, user.role);
  }

  // ── Reactions & reports (any authenticated user) ──────────────
  @Post('reactions')
  react(@CurrentUser() user: RequestUser, @Body() dto: ReactionDto) {
    return this.service.toggleReaction(user.id, dto);
  }

  @Post('reports')
  report(@CurrentUser() user: RequestUser, @Body() dto: ReportDto) {
    return this.service.createReport(user.id, dto);
  }
}
