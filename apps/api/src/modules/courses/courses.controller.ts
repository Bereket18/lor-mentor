import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CoursesService } from './courses.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';

interface AuthUser {
  id: string;
  role: string;
}

@Controller('courses')
export class CoursesController {
  constructor(private readonly service: CoursesService) {}

  // GET /api/v1/courses?semesterId=xxx — PUBLIC
  @Get()
  findBySemester(@Query('semesterId') semesterId: string) {
    return this.service.findBySemester(semesterId);
  }

  // GET /api/v1/courses/mine — TEACHER's own courses
  @Get('mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER')
  findMine(@CurrentUser() user: AuthUser) {
    return this.service.findByTeacher(user.id);
  }

  // GET /api/v1/courses/admin — full list
  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  findAllAdmin() {
    return this.service.findAllAdmin();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  create(@Body() dto: CreateCourseDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN', 'TEACHER')
  update(@Param('id') id: string, @Body() dto: UpdateCourseDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/archive')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  archive(@Param('id') id: string) {
    return this.service.archive(id);
  }
}
