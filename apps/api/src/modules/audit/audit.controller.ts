import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditService } from './audit.service';

/**
 * SUPER_ADMIN only: audit entries can carry security-sensitive metadata
 * (lockouts, IPs, review decisions), so plain admins must not read them.
 */
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  findAll(@Query('take') take = '') {
    return this.audit.findAll(take);
  }
}
