import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { QuizService } from './quiz.service';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';

interface AuthUser {
  id: string;
  role: string;
}

@Controller('quizzes')
@UseGuards(JwtAuthGuard)
export class QuizController {
  constructor(private readonly service: QuizService) {}

  // GET /api/v1/quizzes?courseId=xxx — quizzes for a course + last attempt
  @Get()
  getQuizzes(@Query('courseId') courseId: string, @CurrentUser() user: AuthUser) {
    return this.service.getQuizzesForCourse(courseId, user.id);
  }

  // GET /api/v1/quizzes/:id — questions WITHOUT the correct answers
  @Get(':id')
  getQuiz(@Param('id') id: string) {
    return this.service.getQuiz(id);
  }

  // GET /api/v1/quizzes/:id/attempts/me — this user's past attempts
  @Get(':id/attempts/me')
  getMyAttempts(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.getMyAttempts(id, user.id);
  }

  // POST /api/v1/quizzes/:id/attempt — grade server-side + store the attempt
  @Post(':id/attempt')
  submit(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SubmitAttemptDto,
  ) {
    return this.service.submitAttempt(id, user.id, dto);
  }
}
