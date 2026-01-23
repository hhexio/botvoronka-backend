import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';
import { FunnelStatus } from '@prisma/client';

export class UpdateFunnelDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsEnum(FunnelStatus)
  @IsOptional()
  status?: FunnelStatus;
}
