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
import { CreateUserDto } from './dto/create-user.dto';

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

  @Get('me')
  getMe(@CurrentUser() user: AuthUser) {
    return { user };
  }

  // Full profile with role-relevant relations (department, year, subscription,
  // payments, teacher courses). Drives the /profile page.
  @Get('me/full')
  getMeFull(@CurrentUser() user: AuthUser) {
    return this.usersService.getFullProfile(user.id);
  }

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

  // Create a user. The route allows ADMIN/SUPER_ADMIN; the service enforces
  // which target roles the actor may actually create.
  @Post('create-staff')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  createUser(@CurrentUser() actor: AuthUser, @Body() body: CreateUserDto) {
    return this.usersService.createUser(actor.role, body);
  }

  @Delete('inactive')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN')
  deleteInactive() {
    return this.usersService.deleteInactiveUsers();
  }

  @Patch(':id/role')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  changeRole(
    @Param('id') id: string,
    @Body('role') role: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.usersService.changeRole(id, role, actor.id, actor.role);
  }

  // Delete a single user (hard delete). Service enforces the hierarchy and
  // self / last-super-admin protection.
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  deleteUser(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.usersService.deleteUser(id, actor.id, actor.role);
  }

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

  @Patch('me/profile')
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() body: { fullName?: string },
  ) {
    return this.usersService.updateProfile(user.id, body);
  }
}
