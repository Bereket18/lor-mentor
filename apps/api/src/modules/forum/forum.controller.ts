import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ForumService } from './forum.service';
import { CreatePostDto } from './dto/create-post.dto';
import { CreateReplyDto } from './dto/create-reply.dto';

interface AuthUser {
  id: string;
  role: string;
}

// All forum routes require authentication. Any logged-in user may read and
// post; ownership/role is enforced per-action in the service.
@Controller('forum')
@UseGuards(JwtAuthGuard)
export class ForumController {
  constructor(private readonly service: ForumService) {}

  // GET /api/v1/forum/course/:courseId — section + threads
  @Get('course/:courseId')
  getCourseForum(@Param('courseId') courseId: string) {
    return this.service.getCourseForum(courseId);
  }

  // GET /api/v1/forum/posts/:id — a single thread with replies
  @Get('posts/:id')
  getPost(@Param('id') id: string) {
    return this.service.getPost(id);
  }

  // POST /api/v1/forum/posts — start a thread
  @Post('posts')
  createPost(@CurrentUser() user: AuthUser, @Body() dto: CreatePostDto) {
    return this.service.createPost(user.id, dto);
  }

  // POST /api/v1/forum/posts/:id/replies — reply to a thread
  @Post('posts/:id/replies')
  createReply(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateReplyDto,
  ) {
    return this.service.createReply(id, user.id, dto);
  }

  // DELETE /api/v1/forum/posts/:id — soft-delete (author or privileged)
  @Delete('posts/:id')
  removePost(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.removePost(id, user.id, user.role);
  }
}
