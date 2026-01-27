import { IsOptional, IsDateString } from 'class-validator';

export class AnalyticsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string; // ISO date string

  @IsOptional()
  @IsDateString()
  to?: string;
}
