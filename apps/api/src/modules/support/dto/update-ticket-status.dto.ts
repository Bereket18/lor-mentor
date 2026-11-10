import { IsIn } from 'class-validator';
import { SUPPORT_STATUSES, type SupportStatus } from './list-tickets.dto';

export class UpdateTicketStatusDto {
  @IsIn(SUPPORT_STATUSES, {
    message: `status must be one of: ${SUPPORT_STATUSES.join(', ')}`,
  })
  status!: SupportStatus;
}
