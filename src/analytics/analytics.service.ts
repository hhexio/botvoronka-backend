import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  // Проверка доступа к воронке
  private async checkFunnelAccess(funnelId: string, userId: string) {
    const funnel = await this.prisma.funnel.findUnique({
      where: { id: funnelId },
    });

    if (!funnel) {
      throw new NotFoundException('Funnel not found');
    }

    if (funnel.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return funnel;
  }

  // Получить аналитику воронки
  async getFunnelAnalytics(funnelId: string, userId: string, query: AnalyticsQueryDto) {
    await this.checkFunnelAccess(funnelId, userId);

    const { from, to } = query;
    const dateFilter: any = {};

    if (from) {
      dateFilter.gte = new Date(from);
    }
    if (to) {
      dateFilter.lte = new Date(to);
    }

    const whereClause = {
      funnelId,
      ...(Object.keys(dateFilter).length > 0 && { startedAt: dateFilter }),
    };

    // Получаем все сессии
    const sessions = await this.prisma.funnelSession.findMany({
      where: whereClause,
      orderBy: { startedAt: 'desc' },
    });

    // Считаем метрики
    const totalStarted = sessions.length;
    const completed = sessions.filter(s => s.status === 'COMPLETED' || s.status === 'PAID').length;
    const paid = sessions.filter(s => s.status === 'PAID').length;
    const abandoned = sessions.filter(s => s.status === 'ABANDONED').length;
    const active = sessions.filter(s => s.status === 'ACTIVE').length;

    const totalRevenue = sessions
      .filter(s => s.paidAmount)
      .reduce((sum, s) => sum + (s.paidAmount || 0), 0);

    // Конверсии
    const conversionToComplete = totalStarted > 0
      ? ((completed / totalStarted) * 100).toFixed(2)
      : '0.00';
    const conversionToPaid = totalStarted > 0
      ? ((paid / totalStarted) * 100).toFixed(2)
      : '0.00';

    // Группировка по дням для графика
    const dailyStats = this.groupByDay(sessions);

    return {
      summary: {
        totalStarted,
        completed,
        paid,
        abandoned,
        active,
        totalRevenue,
        conversionToComplete: `${conversionToComplete}%`,
        conversionToPaid: `${conversionToPaid}%`,
      },
      dailyStats,
      recentSessions: sessions.slice(0, 20).map(s => ({
        id: s.id,
        visitorName: s.visitorName || 'Аноним',
        status: s.status,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        paidAmount: s.paidAmount,
      })),
    };
  }

  // Группировка сессий по дням
  private groupByDay(sessions: any[]) {
    const grouped: Record<string, { started: number; completed: number; paid: number; revenue: number }> = {};

    sessions.forEach(session => {
      const day = session.startedAt.toISOString().split('T')[0];

      if (!grouped[day]) {
        grouped[day] = { started: 0, completed: 0, paid: 0, revenue: 0 };
      }

      grouped[day].started++;

      if (session.status === 'COMPLETED' || session.status === 'PAID') {
        grouped[day].completed++;
      }

      if (session.status === 'PAID') {
        grouped[day].paid++;
        grouped[day].revenue += session.paidAmount || 0;
      }
    });

    // Конвертируем в массив и сортируем
    return Object.entries(grouped)
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // Общая аналитика по всем воронкам пользователя
  async getUserAnalytics(userId: string, query: AnalyticsQueryDto) {
    const { from, to } = query;
    const dateFilter: any = {};

    if (from) {
      dateFilter.gte = new Date(from);
    }
    if (to) {
      dateFilter.lte = new Date(to);
    }

    // Получаем все воронки пользователя
    const funnels = await this.prisma.funnel.findMany({
      where: { userId },
      include: {
        _count: { select: { nodes: true } },
        sessions: {
          where: Object.keys(dateFilter).length > 0 ? { startedAt: dateFilter } : undefined,
        },
      },
    });

    // Считаем общую статистику
    let totalStarted = 0;
    let totalCompleted = 0;
    let totalPaid = 0;
    let totalRevenue = 0;

    const funnelStats = funnels.map(funnel => {
      const started = funnel.sessions.length;
      const completed = funnel.sessions.filter(s => s.status === 'COMPLETED' || s.status === 'PAID').length;
      const paid = funnel.sessions.filter(s => s.status === 'PAID').length;
      const revenue = funnel.sessions
        .filter(s => s.paidAmount)
        .reduce((sum, s) => sum + (s.paidAmount || 0), 0);

      totalStarted += started;
      totalCompleted += completed;
      totalPaid += paid;
      totalRevenue += revenue;

      return {
        id: funnel.id,
        name: funnel.name,
        status: funnel.status,
        nodesCount: funnel._count.nodes,
        stats: {
          started,
          completed,
          paid,
          revenue,
          conversion: started > 0 ? `${((paid / started) * 100).toFixed(2)}%` : '0.00%',
        },
      };
    });

    return {
      summary: {
        totalFunnels: funnels.length,
        activeFunnels: funnels.filter(f => f.status === 'ACTIVE').length,
        totalStarted,
        totalCompleted,
        totalPaid,
        totalRevenue,
        overallConversion: totalStarted > 0
          ? `${((totalPaid / totalStarted) * 100).toFixed(2)}%`
          : '0.00%',
      },
      funnels: funnelStats,
    };
  }
}
