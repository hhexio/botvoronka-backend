import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Context } from 'telegraf';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TelegramService implements OnModuleInit {
  private bot: Telegraf;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not defined');
    }
    this.bot = new Telegraf(token);
  }

  async onModuleInit() {
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
    this.bot.launch();
    console.log('Telegram bot started');
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
    return this.bot.telegram.sendMessage(chatId, text);
  }

  // Получение ссылки на бота с параметром
  getBotLink(funnelId: string): string {
    const botUsername = this.config.get<string>('TELEGRAM_BOT_USERNAME');
    return `https://t.me/${botUsername}?start=${funnelId}`;
  }
}
