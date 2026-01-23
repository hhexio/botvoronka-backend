import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { NodesService } from './nodes.service';
import { CreateNodeDto } from './dto/create-node.dto';
import { UpdateNodeDto } from './dto/update-node.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '@prisma/client';

@Controller()
@UseGuards(JwtGuard)
export class NodesController {
  constructor(private nodesService: NodesService) {}

  // GET /api/funnels/:funnelId/nodes
  @Get('funnels/:funnelId/nodes')
  findAllByFunnel(
    @Param('funnelId') funnelId: string,
    @CurrentUser() user: User,
  ) {
    return this.nodesService.findAllByFunnel(funnelId, user.id);
  }

  // POST /api/funnels/:funnelId/nodes
  @Post('funnels/:funnelId/nodes')
  create(
    @Param('funnelId') funnelId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateNodeDto,
  ) {
    return this.nodesService.create(funnelId, user.id, dto);
  }

  // GET /api/nodes/:id
  @Get('nodes/:id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.nodesService.findOne(id, user.id);
  }

  // PATCH /api/nodes/:id
  @Patch('nodes/:id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateNodeDto,
  ) {
    return this.nodesService.update(id, user.id, dto);
  }

  // DELETE /api/nodes/:id
  @Delete('nodes/:id')
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.nodesService.remove(id, user.id);
  }
}
