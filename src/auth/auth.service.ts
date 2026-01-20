import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHmac } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramAuthDto } from './dto/telegram-auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async telegramLogin(dto: TelegramAuthDto) {
    // 1. Проверяем подпись от Telegram
    this.validateTelegramData(dto);

    // 2. Находим или создаём пользователя
    const user = await this.prisma.user.upsert({
      where: { telegramId: String(dto.id) },
      update: {
        username: dto.username,
        firstName: dto.first_name,
        lastName: dto.last_name,
        avatarUrl: dto.photo_url,
      },
      create: {
        telegramId: String(dto.id),
        username: dto.username,
        firstName: dto.first_name,
        lastName: dto.last_name,
        avatarUrl: dto.photo_url,
      },
    });

    // 3. Генерируем токены
    const tokens = await this.generateTokens(user.id);

    return {
      user,
      ...tokens,
    };
  }

  async refresh(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const tokens = await this.generateTokens(user.id);

    return {
      user,
      ...tokens,
    };
  }

  private validateTelegramData(dto: TelegramAuthDto) {
    const botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN');

    if (!botToken) {
      throw new UnauthorizedException('Bot token not configured');
    }

    // Проверяем что auth_date не старше 24 часов
    const authDate = dto.auth_date;
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) {
      throw new UnauthorizedException('Telegram auth data expired');
    }

    // Формируем строку для проверки
    const checkArr = Object.entries(dto)
      .filter(([key]) => key !== 'hash')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`);
    const checkString = checkArr.join('\n');

    // Вычисляем хеш
    const secretKey = createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();
    const hash = createHmac('sha256', secretKey)
      .update(checkString)
      .digest('hex');

    if (hash !== dto.hash) {
      throw new UnauthorizedException('Invalid Telegram auth data');
    }
  }

  private async generateTokens(userId: string) {
    const payload = { sub: userId };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.get('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN'),
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN'),
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }
}
