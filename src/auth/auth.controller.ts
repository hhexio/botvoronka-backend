import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { TelegramAuthDto } from './dto/telegram-auth.dto';
import { JwtGuard } from './guards/jwt.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import type { User } from '@prisma/client';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('telegram')
  telegramLogin(@Body() dto: TelegramAuthDto) {
    return this.authService.telegramLogin(dto);
  }

  @UseGuards(JwtGuard)
  @Post('refresh')
  refresh(@CurrentUser() user: User) {
    return this.authService.refresh(user.id);
  }

  @UseGuards(JwtGuard)
  @Post('logout')
  logout() {
    return { message: 'Logged out successfully' };
  }
}
