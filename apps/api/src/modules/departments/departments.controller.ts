import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  // GET /api/v1/departments
  // PUBLIC — no guard — guests can browse departments
  @Get()
  findAllPublic() {
    return this.departmentsService.findAllPublic();
  }

  // GET /api/v1/departments/admin
  // ADMIN — full list including archived
  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  findAllAdmin() {
    return this.departmentsService.findAllAdmin();
  }

  // GET /api/v1/departments/:id
  // PUBLIC — anyone can view a department's structure
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.departmentsService.findOne(id);
  }

  // POST /api/v1/departments
  // ADMIN only
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  create(@Body() dto: CreateDepartmentDto) {
    return this.departmentsService.create(dto);
  }

  // PATCH /api/v1/departments/:id
  // ADMIN only
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  update(@Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    return this.departmentsService.update(id, dto);
  }

  // PATCH /api/v1/departments/:id/archive
  // ADMIN only
  @Patch(':id/archive')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  archive(@Param('id') id: string) {
    return this.departmentsService.archive(id);
  }

  // PATCH /api/v1/departments/:id/restore
  // ADMIN only
  @Patch(':id/restore')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  restore(@Param('id') id: string) {
    return this.departmentsService.restore(id);
  }
}
