import { IsString, IsOptional, IsObject } from 'class-validator';

export class UpdateNodeDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsObject()
  @IsOptional()
  content?: Record<string, any>;

  @IsObject()
  @IsOptional()
  position?: { x: number; y: number };
}
