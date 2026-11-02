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
import { SkipAudit } from '../../common/decorators/audit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SetAnatomyReviewerDto } from './dto/set-anatomy-reviewer.dto';

import type { RequestUser } from '../../common/types/request-user';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: RequestUser) {
    return { user };
  }

  // Full profile with role-relevant relations (department, year, subscription,
  // payments, teacher courses). Drives the /profile page.
  @Get('me/full')
  getMeFull(@CurrentUser() user: RequestUser) {
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
    @Query('isActive') isActive = '',
    @Query('departmentId') departmentId = '',
  ) {
    return this.usersService.findAll({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      search,
      role,
      sortBy,
      isActive,
      departmentId,
    });
  }

  // Create a user. The route allows ADMIN/SUPER_ADMIN; the service enforces
  // which target roles the actor may actually create.
  @Post('create-staff')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  createUser(@CurrentUser() actor: RequestUser, @Body() body: CreateUserDto) {
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
    @CurrentUser() actor: RequestUser,
  ) {
    return this.usersService.changeRole(id, role, actor.id, actor.role);
  }

  // Delete a single user (hard delete). Service enforces the hierarchy and
  // self / last-super-admin protection.
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  deleteUser(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    return this.usersService.deleteUser(id, actor.id, actor.role);
  }

  // Admin: grant or revoke a teacher's anatomy reviewer access. The service
  // restricts the target to TEACHER and writes its own richer audit entry
  // (ANATOMY_REVIEWER_GRANT / ANATOMY_REVIEWER_REVOKE), so skip the automatic
  // one just like the status change above.
  @Patch(':id/anatomy-reviewer')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @SkipAudit()
  setAnatomyReviewer(
    @Param('id') id: string,
    @Body() body: SetAnatomyReviewerDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.usersService.setAnatomyReviewer(
      id,
      body.isAnatomyReviewer,
      actor.id,
      actor.role,
    );
  }

  // changeStatus writes its own richer USER_ACTIVATED / USER_DEACTIVATED
  // audit entry in UsersService, so don't create a second automatic entry.
  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @SkipAudit()
  changeStatus(
    @Param('id') id: string,
    @Body('isActive') isActive: boolean,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.usersService.changeStatus(id, isActive, actor.id);
  }

  // Admin: assign or re-assign a user's department and academic year.
  // Allows fixing program assignment after account creation.
  @Patch(':id/assignment')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  assignDepartment(
    @Param('id') id: string,
    @Body('departmentId') departmentId: string,
    @Body('academicYearId') academicYearId: string | undefined,
  ) {
    return this.usersService.assignDepartment(id, departmentId, academicYearId);
  }

  @Patch('me/profile')
  updateProfile(
    @CurrentUser() user: RequestUser,
    @Body() body: { fullName?: string },
  ) {
    return this.usersService.updateProfile(user.id, body);
  }

  @Patch('me/password')
  changePassword(
    @CurrentUser() user: RequestUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}
