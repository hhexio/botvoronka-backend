import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { SubscribeDto } from './dto/subscribe.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { User } from '@prisma/client';

@Controller('billing')
export class BillingController {
  constructor(private billingService: BillingService) {}

  // GET /api/billing/subscription — текущая подписка
  @Get('subscription')
  @UseGuards(JwtGuard)
  getSubscription(@CurrentUser() user: User) {
    return this.billingService.getSubscription(user.id);
  }

  // POST /api/billing/subscribe — оформить подписку
  @Post('subscribe')
  @UseGuards(JwtGuard)
  subscribe(@CurrentUser() user: User, @Body() dto: SubscribeDto) {
    return this.billingService.subscribe(user.id, dto);
  }

  // POST /api/billing/payment — создать произвольный платёж
  @Post('payment')
  @UseGuards(JwtGuard)
  createPayment(@CurrentUser() user: User, @Body() dto: CreatePaymentDto) {
    return this.billingService.createPayment(user.id, dto);
  }

  // GET /api/billing/payments — история платежей
  @Get('payments')
  @UseGuards(JwtGuard)
  getPayments(@CurrentUser() user: User) {
    return this.billingService.getPayments(user.id);
  }

  // POST /api/billing/webhook — webhook от ЮKassa (публичный)
  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  handleWebhook(@Body() body: any) {
    return this.billingService.handleWebhook(body);
  }

  // POST /api/billing/demo/confirm/:id — демо подтверждение платежа
  @Post('demo/confirm/:id')
  @UseGuards(JwtGuard)
  confirmPaymentDemo(
    @Param('id') paymentId: string,
    @CurrentUser() user: User,
  ) {
    return this.billingService.confirmPaymentDemo(paymentId, user.id);
  }
}
