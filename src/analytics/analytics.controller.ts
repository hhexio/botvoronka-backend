import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '@prisma/client';

@Controller('analytics')
@UseGuards(JwtGuard)
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  // GET /api/analytics — общая статистика пользователя
  @Get()
  getUserAnalytics(
    @CurrentUser() user: User,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getUserAnalytics(user.id, query);
  }

  // GET /api/analytics/funnel/:id — статистика конкретной воронки
  @Get('funnel/:id')
  getFunnelAnalytics(
    @Param('id') funnelId: string,
    @CurrentUser() user: User,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getFunnelAnalytics(funnelId, user.id, query);
  }
}
