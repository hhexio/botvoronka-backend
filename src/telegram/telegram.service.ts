import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Context } from 'telegraf';
import { PrismaService } from '../prisma/prisma.service';

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
    // Если токен не указан, пропускаем инициализацию бота
    if (!this.bot) {
      console.warn(
        '⚠️  TELEGRAM_BOT_TOKEN not configured - bot features disabled',
      );
      return;
    }

    try {
      // Обработка /start с параметром воронки
      this.bot.start(async (ctx) => {
        const startPayload = ctx.startPayload; // ID воронки из ссылки
        const telegramUser = ctx.from;

        if (!startPayload) {
          await ctx.reply('Добро пожаловать! Эта ссылка недействительна.');
          return;
        }

        // Находим воронку
        const funnel = await this.prisma.funnel.findUnique({
          where: { id: startPayload },
          include: { nodes: { orderBy: { createdAt: 'asc' } } },
        });

        if (!funnel || funnel.status !== 'ACTIVE') {
          await ctx.reply('Воронка не найдена или неактивна.');
          return;
        }

        // Начинаем воронку — отправляем первый узел
        const firstNode = funnel.nodes[0];
        if (firstNode) {
          await this.processNode(ctx, firstNode);
        }
      });

      // Запуск бота
      await this.bot.launch();
      console.log('✅ Telegram bot started');
    } catch (error) {
      console.error('❌ Failed to start Telegram bot:', error.message);
      console.warn('Bot features will be disabled. Check TELEGRAM_BOT_TOKEN.');
    }
  }

  // Обработка узла воронки
  private async processNode(ctx: Context, node: any) {
    const content = (node.content as Record<string, any>) || {};

    switch (node.type) {
      case 'MESSAGE':
        await ctx.reply(content.text || 'Пустое сообщение');
        break;

      case 'BUTTON':
        await ctx.reply(content.text || 'Выберите действие:', {
          reply_markup: {
            inline_keyboard: [
              (content.buttons || []).map((btn: any) => ({
                text: btn.text,
                callback_data: `node_${btn.nextNodeId}`,
              })),
            ],
          },
        });
        break;

      case 'DELAY':
        const delayMs = (content.seconds || 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        // После задержки нужно перейти к следующему узлу
        break;

      case 'PAYMENT':
        await ctx.reply(
          `💳 Оплата: ${content.productName}\nЦена: ${content.price}₽\n\n(Интеграция с ЮKassa будет добавлена позже)`,
        );
        break;

      default:
        await ctx.reply(`Неизвестный тип узла: ${node.type}`);
    }
  }

  // Отправка сообщения пользователю (для уведомлений)
  async sendMessage(chatId: number | string, text: string) {
    if (!this.bot) {
      throw new Error('Telegram bot is not configured');
    }
    return this.bot.telegram.sendMessage(chatId, text);
  }

  // Получение ссылки на бота с параметром
  getBotLink(funnelId: string): string {
    const botUsername = this.config.get<string>('TELEGRAM_BOT_USERNAME');
    if (!botUsername) {
      return `[Bot not configured - set TELEGRAM_BOT_USERNAME in .env]`;
    }
    return `https://t.me/${botUsername}?start=${funnelId}`;
  }

  // Graceful shutdown
  async onModuleDestroy() {
    if (this.bot) {
      await this.bot.stop();
      console.log('🛑 Telegram bot stopped');
    }
  }
}
