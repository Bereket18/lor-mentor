import { IsNotEmpty, IsString } from 'class-validator';

export class InitializeChapaDto {
  @IsString()
  @IsNotEmpty()
  planId!: string;
}
