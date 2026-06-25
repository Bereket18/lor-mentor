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

  // GET /api/v1/courses?semesterId=xxx — PUBLIC (published only)
  @Get()
  findBySemester(@Query('semesterId') semesterId: string) {
    return this.service.findBySemester(semesterId);
  }

  // GET /api/v1/courses/admin-semester?semesterId=xxx — ADMIN (all incl. drafts)
  @Get('admin-semester')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  findBySemesterAdmin(@Query('semesterId') semesterId: string) {
    return this.service.findBySemesterAdmin(semesterId);
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

  // GET /api/v1/courses/my-year — courses in the student's own department + year
  // This enforces "cannot access other department" at the data level
  @Get('my-year')
  @UseGuards(JwtAuthGuard)
  async findMyYear(@CurrentUser() user: AuthUser) {
    return this.service.findByStudent(user.id);
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
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCourseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Patch(':id/archive')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  archive(@Param('id') id: string) {
    return this.service.archive(id);
  }
}
