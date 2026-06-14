import {
  Controller,
  Get,
  Patch,
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

// ── Typed user shape returned by JwtStrategy.validate() ──────
// We define the shape here so we never use 'any'
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

  // GET /api/v1/users
  // Admin only — paginated list with search and role filter
  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search = '',
    @Query('role') role = '',
  ) {
    return this.usersService.findAll({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      search,
      role,
    });
  }

  // PATCH /api/v1/users/:id/role
  // Admin only — change a user's role
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
  // Admin only — activate or deactivate account
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
  // Any logged-in user can update their own profile
  @Patch('me/profile')
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() body: { fullName?: string },
  ) {
    return this.usersService.updateProfile(user.id, body);
  }
}
