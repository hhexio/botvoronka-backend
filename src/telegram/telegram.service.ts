import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Context } from 'telegraf';
import { PrismaService } from '../prisma/prisma.service';
import type { Node, FunnelSession } from '@prisma/client';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private bot: Telegraf;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (token) {
      this.bot = new Telegraf(token);
    }
  }

  async onModuleInit() {
    if (!this.bot) {
      console.warn(
        '⚠️  TELEGRAM_BOT_TOKEN not configured - bot features disabled',
      );
      return;
    }

    try {
      // Обработка /start с параметром воронки
      this.bot.start(async (ctx) => {
        await this.handleStart(ctx);
      });

      // Обработка callback кнопок
      this.bot.on('callback_query', async (ctx) => {
        await this.handleCallback(ctx);
      });

      // Обработка текстовых сообщений
      this.bot.on('text', async (ctx) => {
        await this.handleText(ctx);
      });

      this.bot
        .launch()
        .then(() => {
          console.log('✅ Telegram bot started');
        })
        .catch((error) => {
          console.error('❌ Failed to start Telegram bot:', error.message);
        });
    } catch (error) {
      console.error('❌ Failed to start Telegram bot:', error.message);
    }
  }

  // Обработка /start
  private async handleStart(ctx: Context) {
    const startPayload = (ctx as any).startPayload;
    const telegramUser = ctx.from;

    if (!telegramUser) {
      await ctx.reply('Ошибка: не удалось получить данные пользователя.');
      return;
    }

    if (!startPayload) {
      await ctx.reply(
        '👋 Добро пожаловать в BotVoronka!\n\n' +
          'Это бот для прохождения воронок продаж.\n' +
          'Перейдите по ссылке от автора воронки, чтобы начать.',
      );
      return;
    }

    // Находим воронку
    const funnel = await this.prisma.funnel.findUnique({
      where: { id: startPayload },
      include: { nodes: { orderBy: { createdAt: 'asc' } } },
    });

    if (!funnel) {
      await ctx.reply('❌ Воронка не найдена.');
      return;
    }

    if (funnel.status !== 'ACTIVE') {
      await ctx.reply('⏸ Эта воронка сейчас неактивна.');
      return;
    }

    if (funnel.nodes.length === 0) {
      await ctx.reply('📭 Воронка пуста.');
      return;
    }

    // Создаём или обновляем сессию
    const visitorId = String(telegramUser.id);
    let session = await this.prisma.funnelSession.findFirst({
      where: { visitorId, funnelId: funnel.id, status: 'ACTIVE' },
    });

    const firstNode = funnel.nodes[0];

    if (session) {
      // Обновляем существующую сессию — начинаем сначала
      session = await this.prisma.funnelSession.update({
        where: { id: session.id },
        data: {
          currentNodeId: firstNode.id,
          startedAt: new Date(),
        },
      });
    } else {
      // Создаём новую сессию
      session = await this.prisma.funnelSession.create({
        data: {
          visitorId,
          visitorName: telegramUser.first_name || telegramUser.username,
          funnelId: funnel.id,
          currentNodeId: firstNode.id,
          status: 'ACTIVE',
        },
      });
    }

    // Отправляем первый узел
    await this.processNode(ctx, firstNode, session);
  }

  // Обработка callback кнопок
  private async handleCallback(ctx: Context) {
    const callbackQuery = ctx.callbackQuery;
    if (!callbackQuery || !('data' in callbackQuery)) return;

    const data = callbackQuery.data;
    const telegramUser = ctx.from;

    if (!telegramUser) return;

    // Убираем "часики" с кнопки
    await ctx.answerCbQuery();

    // Парсим данные кнопки
    if (data.startsWith('node_')) {
      const nodeId = data.replace('node_', '');
      await this.goToNode(ctx, String(telegramUser.id), nodeId);
    } else if (data.startsWith('next_')) {
      const sessionId = data.replace('next_', '');
      await this.goToNextNode(ctx, String(telegramUser.id), sessionId);
    }
  }

  // Обработка текстовых сообщений
  private async handleText(ctx: Context) {
    const telegramUser = ctx.from;
    if (!telegramUser) return;

    // Находим активную сессию пользователя
    const session = await this.prisma.funnelSession.findFirst({
      where: {
        visitorId: String(telegramUser.id),
        status: 'ACTIVE',
      },
      include: {
        funnel: {
          include: { nodes: { orderBy: { createdAt: 'asc' } } },
        },
      },
    });

    if (!session) {
      await ctx.reply(
        'У вас нет активной воронки. Перейдите по ссылке, чтобы начать.',
      );
      return;
    }

    // Можно сохранять ответы пользователя в session.data
    // Пока просто переходим к следующему узлу
    await this.goToNextNode(ctx, String(telegramUser.id), session.id);
  }

  // Перейти к конкретному узлу
  private async goToNode(ctx: Context, visitorId: string, nodeId: string) {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      include: { funnel: true },
    });

    if (!node) return;

    const session = await this.prisma.funnelSession.findFirst({
      where: { visitorId, funnelId: node.funnelId, status: 'ACTIVE' },
    });

    if (!session) return;

    // Обновляем текущий узел
    await this.prisma.funnelSession.update({
      where: { id: session.id },
      data: { currentNodeId: nodeId },
    });

    await this.processNode(ctx, node, session);
  }

  // Перейти к следующему узлу
  private async goToNextNode(
    ctx: Context,
    visitorId: string,
    sessionId: string,
  ) {
    const session = await this.prisma.funnelSession.findUnique({
      where: { id: sessionId },
      include: {
        funnel: {
          include: { nodes: { orderBy: { createdAt: 'asc' } } },
        },
      },
    });

    if (!session || session.visitorId !== visitorId) return;

    const nodes = session.funnel.nodes;
    const currentIndex = nodes.findIndex((n) => n.id === session.currentNodeId);

    if (currentIndex === -1 || currentIndex >= nodes.length - 1) {
      // Воронка завершена
      await this.completeSession(ctx, session);
      return;
    }

    const nextNode = nodes[currentIndex + 1];

    // Обновляем текущий узел
    await this.prisma.funnelSession.update({
      where: { id: session.id },
      data: { currentNodeId: nextNode.id },
    });

    await this.processNode(ctx, nextNode, session);
  }

  // Завершить сессию
  private async completeSession(ctx: Context, session: FunnelSession) {
    await this.prisma.funnelSession.update({
      where: { id: session.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    await ctx.reply(
      '🎉 Поздравляем! Вы прошли воронку до конца.\n\n' +
        'Спасибо за внимание!',
    );
  }

  // Обработка узла
  private async processNode(ctx: Context, node: Node, session: FunnelSession) {
    const content = (node.content as Record<string, any>) || {};

    switch (node.type) {
      case 'MESSAGE':
        await ctx.reply(content.text || 'Сообщение');
        // Автоматически переходим к следующему через 1 секунду
        setTimeout(async () => {
          await this.goToNextNode(ctx, session.visitorId, session.id);
        }, 1000);
        break;

      case 'BUTTON':
        const buttons = content.buttons || [];
        if (buttons.length > 0) {
          await ctx.reply(content.text || 'Выберите действие:', {
            reply_markup: {
              inline_keyboard: buttons.map((btn: any) => [
                {
                  text: btn.text,
                  callback_data: btn.nextNodeId
                    ? `node_${btn.nextNodeId}`
                    : `next_${session.id}`,
                },
              ]),
            },
          });
        } else {
          // Если кнопок нет — показываем кнопку "Далее"
          await ctx.reply(content.text || 'Продолжить?', {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: 'Далее →',
                    callback_data: `next_${session.id}`,
                  },
                ],
              ],
            },
          });
        }
        break;

      case 'DELAY':
        const seconds = content.seconds || 1;
        await ctx.reply(`⏳ Подождите ${seconds} сек...`);
        setTimeout(async () => {
          await this.goToNextNode(ctx, session.visitorId, session.id);
        }, seconds * 1000);
        break;

      case 'PAYMENT':
        // TODO: Интеграция с BillingService для создания платежа
        await ctx.reply(
          `💳 **Оплата**\n\n` +
            `📦 ${content.productName || 'Товар'}\n` +
            `💰 Цена: ${content.price || 0}₽\n\n` +
            `(Интеграция с оплатой в разработке)`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '✅ Оплатить (демо)',
                    callback_data: `next_${session.id}`,
                  },
                ],
              ],
            },
          },
        );

        // В реальности здесь будет:
        // 1. Создание платежа через BillingService
        // 2. Отправка ссылки на оплату
        // 3. Ожидание webhook об успешной оплате
        // 4. Переход к следующему узлу
        break;

      case 'CONDITION':
        // Условный переход — пока просто идём дальше
        await this.goToNextNode(ctx, session.visitorId, session.id);
        break;

      default:
        await ctx.reply(`Неизвестный тип: ${node.type}`);
        await this.goToNextNode(ctx, session.visitorId, session.id);
    }
  }

  // Публичные методы для использования из других модулей

  async sendMessage(chatId: number | string, text: string) {
    if (!this.bot) {
      throw new Error('Telegram bot is not configured');
    }
    return this.bot.telegram.sendMessage(chatId, text);
  }

  getBotLink(funnelId: string): string {
    const botUsername = this.config.get<string>('TELEGRAM_BOT_USERNAME');
    if (!botUsername) {
      return `[Bot not configured - set TELEGRAM_BOT_USERNAME in .env]`;
    }
    return `https://t.me/${botUsername}?start=${funnelId}`;
  }

  async onModuleDestroy() {
    if (this.bot) {
      await this.bot.stop();
      console.log('🛑 Telegram bot stopped');
    }
  }
}
