import { IsString, IsNumber, IsOptional, Min } from 'class-validator';

export class CreatePaymentDto {
  @IsNumber()
  @Min(100) // Минимум 1 рубль (100 копеек)
  amount: number;

  @IsString()
  description: string;

  @IsString()
  @IsOptional()
  funnelId?: string;

  @IsString()
  @IsOptional()
  returnUrl?: string;
}
