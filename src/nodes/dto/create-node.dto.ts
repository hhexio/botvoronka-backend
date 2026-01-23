import { IsString, IsEnum, IsOptional, IsObject } from 'class-validator';
import { NodeType } from '@prisma/client';

export class CreateNodeDto {
  @IsEnum(NodeType)
  type: NodeType;

  @IsString()
  name: string;

  @IsObject()
  @IsOptional()
  content?: Record<string, any>;

  @IsObject()
  @IsOptional()
  position?: { x: number; y: number };
}
