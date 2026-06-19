import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from './users.service';

interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  isEmailVerified: boolean;
  createdAt: Date;
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // GET /api/v1/users/me
  @Get('me')
  getMe(@CurrentUser() user: AuthUser) {
    return { user };
  }

  // GET /api/v1/users?search=&role=&sortBy=role
  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('search') search = '',
    @Query('role') role = '',
    @Query('sortBy') sortBy = '',
  ) {
    return this.usersService.findAll({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      search,
      role,
      sortBy,
    });
  }

  // POST /api/v1/users/create-staff
  @Post('create-staff')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  createStaff(
    @Body()
    body: {
      fullName: string;
      email: string;
      role: 'TEACHER' | 'ADMIN';
      departmentId?: string;
    },
  ) {
    return this.usersService.createStaff(body);
  }

  // DELETE /api/v1/users/inactive — SUPER_ADMIN only
  // Permanently removes student/guest accounts inactive for 12+ months
  @Delete('inactive')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN')
  deleteInactive() {
    return this.usersService.deleteInactiveUsers();
  }

  // PATCH /api/v1/users/:id/role
  @Patch(':id/role')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  changeRole(
    @Param('id') id: string,
    @Body('role') role: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.usersService.changeRole(id, role, actor.id);
  }

  // PATCH /api/v1/users/:id/status
  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  changeStatus(
    @Param('id') id: string,
    @Body('isActive') isActive: boolean,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.usersService.changeStatus(id, isActive, actor.id);
  }

  // PATCH /api/v1/users/me/profile
  @Patch('me/profile')
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() body: { fullName?: string },
  ) {
    return this.usersService.updateProfile(user.id, body);
  }
}
