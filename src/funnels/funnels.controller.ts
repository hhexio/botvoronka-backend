import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FunnelsService } from './funnels.service';
import { CreateFunnelDto } from './dto/create-funnel.dto';
import { UpdateFunnelDto } from './dto/update-funnel.dto';
import { FunnelQueryDto } from './dto/funnel-query.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TelegramService } from '../telegram/telegram.service';
import type { User } from '@prisma/client';

@Controller('funnels')
@UseGuards(JwtGuard)
export class FunnelsController {
  constructor(
    private funnelsService: FunnelsService,
    private telegramService: TelegramService,
  ) {}

  // GET /api/funnels/templates
  @Get('templates')
  getTemplates() {
    return this.funnelsService.getTemplates();
  }

  @Get()
  findAll(@CurrentUser() user: User, @Query() query: FunnelQueryDto) {
    return this.funnelsService.findAll(user.id, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.funnelsService.findOne(id, user.id);
  }

  // POST /api/funnels/from-template
  @Post('from-template')
  createFromTemplate(
    @CurrentUser() user: User,
    @Body() body: { templateId: string; name?: string },
  ) {
    return this.funnelsService.createFromTemplate(user.id, body.templateId, body.name);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateFunnelDto) {
    return this.funnelsService.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateFunnelDto,
  ) {
    return this.funnelsService.update(id, user.id, dto);
  }

  // PATCH /api/funnels/:id/publish
  @Patch(':id/publish')
  async publish(@Param('id') id: string, @CurrentUser() user: User) {
    const funnel = await this.funnelsService.update(id, user.id, {
      status: 'ACTIVE',
    });

    const botLink = this.telegramService.getBotLink(funnel.id);

    return {
      ...funnel,
      botLink,
    };
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.funnelsService.remove(id, user.id);
  }
}
