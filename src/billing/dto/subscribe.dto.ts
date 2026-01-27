import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Plan } from '@prisma/client';

export class SubscribeDto {
  @IsEnum(Plan)
  plan: Plan;

  @IsString()
  @IsOptional()
  returnUrl?: string;
}
