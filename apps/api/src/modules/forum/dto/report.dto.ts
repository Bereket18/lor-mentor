import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReportDto {
  @IsOptional()
  @IsString()
  postId?: string;

  @IsOptional()
  @IsString()
  replyId?: string;

  @IsIn(['SPAM', 'OFFENSIVE', 'OFF_TOPIC', 'OTHER'])
  reason!: 'SPAM' | 'OFFENSIVE' | 'OFF_TOPIC' | 'OTHER';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ResolveReportDto {
  @IsIn(['REMOVE', 'DISMISS'])
  action!: 'REMOVE' | 'DISMISS';
}
