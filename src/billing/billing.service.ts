import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { SubscribeDto } from './dto/subscribe.dto';
import { randomUUID } from 'crypto';

// Цены подписок в копейках
const PLAN_PRICES = {
  FREE: 0,
  PRO: 499000, // 4990 рублей
};

@Injectable()
export class BillingService {
  private readonly shopId: string;
  private readonly secretKey: string;
  private readonly isProduction: boolean;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.shopId = this.config.get<string>('YOKASSA_SHOP_ID') || 'demo_shop';
    this.secretKey = this.config.get<string>('YOKASSA_SECRET_KEY') || 'demo_key';
    this.isProduction = this.config.get<string>('NODE_ENV') === 'production';
  }

  // Получить текущую подписку пользователя
  async getSubscription(userId: string) {
    let subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    // Если подписки нет — создаём FREE
    if (!subscription) {
      subscription = await this.prisma.subscription.create({
        data: {
          userId,
          plan: 'FREE',
          status: 'ACTIVE',
        },
      });
    }

    return {
      ...subscription,
      limits: this.getPlanLimits(subscription.plan),
    };
  }

  // Лимиты по планам
  private getPlanLimits(plan: string) {
    switch (plan) {
      case 'PRO':
        return {
          maxFunnels: -1, // Безлимит
          maxLeadsPerMonth: -1,
          features: ['analytics', 'priority_support', 'custom_domain'],
        };
      case 'FREE':
      default:
        return {
          maxFunnels: 1,
          maxLeadsPerMonth: 100,
          features: [],
        };
    }
  }

  // Создать платёж для подписки PRO
  async subscribe(userId: string, dto: SubscribeDto) {
    if (dto.plan === 'FREE') {
      // Переход на FREE — просто обновляем подписку
      const subscription = await this.prisma.subscription.upsert({
        where: { userId },
        update: { plan: 'FREE', status: 'ACTIVE', expiresAt: null },
        create: { userId, plan: 'FREE', status: 'ACTIVE' },
      });
      return { subscription, paymentUrl: null };
    }

    const amount = PLAN_PRICES[dto.plan];
    if (!amount) {
      throw new BadRequestException('Invalid plan');
    }

    // Создаём платёж
    const payment = await this.createPayment(userId, {
      amount,
      description: `Подписка BotVoronka ${dto.plan}`,
      returnUrl: dto.returnUrl,
    });

    return {
      paymentId: payment.id,
      paymentUrl: payment.confirmationUrl,
      amount: payment.amount,
    };
  }

  // Создать платёж (универсальный метод)
  async createPayment(userId: string, dto: CreatePaymentDto) {
    const idempotenceKey = randomUUID();
    const orderId = `order_${Date.now()}_${randomUUID().slice(0, 8)}`;

    // В демо-режиме создаём mock платёж
    if (!this.isProduction || this.shopId === 'demo_shop') {
      const payment = await this.prisma.payment.create({
        data: {
          oderId: orderId,
          userId,
          amount: dto.amount,
          description: dto.description,
          funnelId: dto.funnelId,
          status: 'PENDING',
          // Демо URL — в реальности будет от ЮKassa
          confirmationUrl: `https://demo.yokassa.ru/pay/${orderId}?amount=${dto.amount}`,
          metadata: { idempotenceKey, demo: true },
        },
      });

      return payment;
    }

    // Реальный запрос к ЮKassa API
    // TODO: Реализовать когда будут реальные ключи
    try {
      const response = await fetch('https://api.yookassa.ru/v3/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotence-Key': idempotenceKey,
          Authorization: `Basic ${Buffer.from(`${this.shopId}:${this.secretKey}`).toString('base64')}`,
        },
        body: JSON.stringify({
          amount: {
            value: (dto.amount / 100).toFixed(2), // Конвертируем копейки в рубли
            currency: 'RUB',
          },
          confirmation: {
            type: 'redirect',
            return_url: dto.returnUrl || 'https://botvoronka.ru/billing/success',
          },
          capture: true,
          description: dto.description,
          metadata: {
            userId,
            funnelId: dto.funnelId,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new BadRequestException(data.description || 'Payment creation failed');
      }

      // Сохраняем платёж в БД
      const payment = await this.prisma.payment.create({
        data: {
          oderId: data.id,
          userId,
          amount: dto.amount,
          description: dto.description,
          funnelId: dto.funnelId,
          status: 'PENDING',
          confirmationUrl: data.confirmation?.confirmation_url,
          metadata: { idempotenceKey },
        },
      });

      return payment;
    } catch (error) {
      console.error('YooKassa API error:', error);
      throw new BadRequestException('Failed to create payment');
    }
  }

  // Обработка webhook от ЮKassa
  async handleWebhook(body: any) {
    const { event, object } = body;

    if (!object?.id) {
      return { received: true };
    }

    const payment = await this.prisma.payment.findUnique({
      where: { oderId: object.id },
    });

    if (!payment) {
      console.warn(`Payment not found: ${object.id}`);
      return { received: true };
    }

    // Обновляем статус платежа
    let newStatus = payment.status;
    switch (event) {
      case 'payment.succeeded':
        newStatus = 'SUCCEEDED';
        break;
      case 'payment.canceled':
        newStatus = 'CANCELLED';
        break;
      case 'payment.waiting_for_capture':
        newStatus = 'WAITING_FOR_CAPTURE';
        break;
      case 'refund.succeeded':
        newStatus = 'REFUNDED';
        break;
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: newStatus,
        paymentMethod: object.payment_method?.type,
      },
    });

    // Если платёж успешен — активируем подписку
    if (newStatus === 'SUCCEEDED' && payment.description?.includes('Подписка')) {
      await this.prisma.subscription.upsert({
        where: { userId: payment.userId },
        update: {
          plan: 'PRO',
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 дней
        },
        create: {
          userId: payment.userId,
          plan: 'PRO',
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
    }

    return { received: true, status: newStatus };
  }

  // Получить историю платежей
  async getPayments(userId: string) {
    return this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // Демо: подтвердить платёж вручную (для тестирования)
  async confirmPaymentDemo(paymentId: string, userId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, userId },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Имитируем webhook
    return this.handleWebhook({
      event: 'payment.succeeded',
      object: { id: payment.oderId, payment_method: { type: 'demo' } },
    });
  }
}
