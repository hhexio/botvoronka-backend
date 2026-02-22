import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFunnelDto } from './dto/create-funnel.dto';
import { UpdateFunnelDto } from './dto/update-funnel.dto';
import { FunnelQueryDto } from './dto/funnel-query.dto';

@Injectable()
export class FunnelsService {
  constructor(private prisma: PrismaService) {}

  // Шаблоны воронок
  private readonly templates = {
    consultation: {
      name: 'Запись на консультацию',
      description: 'Воронка для записи клиентов на консультацию',
      nodes: [
        {
          type: 'MESSAGE',
          name: 'Приветствие',
          content: {
            text: 'Здравствуйте! Я помогу записать вас на консультацию.',
          },
        },
        {
          type: 'MESSAGE',
          name: 'Описание',
          content: {
            text: 'На консультации мы разберём вашу ситуацию и составим план действий.',
          },
        },
        {
          type: 'PAYMENT',
          name: 'Оплата',
          content: { productName: 'Консультация 60 мин', price: 2990 },
        },
        {
          type: 'MESSAGE',
          name: 'Подтверждение',
          content: { text: 'Отлично! Я свяжусь с вами для выбора времени.' },
        },
      ],
    },
    course: {
      name: 'Продажа курса',
      description: 'Воронка для продажи онлайн-курса',
      nodes: [
        {
          type: 'MESSAGE',
          name: 'Приветствие',
          content: { text: '👋 Привет! Хочешь освоить новый навык?' },
        },
        {
          type: 'MESSAGE',
          name: 'Боль',
          content: {
            text: 'Многие тратят годы на самообучение и не получают результата...',
          },
        },
        {
          type: 'MESSAGE',
          name: 'Решение',
          content: {
            text: 'Мой курс поможет тебе за 30 дней получить конкретный результат!',
          },
        },
        {
          type: 'PAYMENT',
          name: 'Оплата',
          content: { productName: 'Онлайн-курс', price: 9990 },
        },
        {
          type: 'MESSAGE',
          name: 'Успех',
          content: {
            text: '🎉 Добро пожаловать! Доступ к курсу отправлен на почту.',
          },
        },
      ],
    },
    leadmagnet: {
      name: 'Лид-магнит',
      description: 'Бесплатный материал в обмен на контакт',
      nodes: [
        {
          type: 'MESSAGE',
          name: 'Предложение',
          content: {
            text: '🎁 Получи бесплатный чек-лист "10 секретов успеха"!',
          },
        },
        {
          type: 'BUTTON',
          name: 'Получить',
          content: {
            text: 'Нажми кнопку чтобы получить:',
            buttons: [{ text: '📥 Получить чек-лист', action: 'next' }],
          },
        },
        {
          type: 'MESSAGE',
          name: 'Доставка',
          content: {
            text: '✅ Отлично! Вот твой чек-лист: [ссылка]\n\nПодпишись на канал, чтобы не пропустить новые материалы!',
          },
        },
      ],
    },
    webinar: {
      name: 'Регистрация на вебинар',
      description: 'Воронка для регистрации на вебинар',
      nodes: [
        {
          type: 'MESSAGE',
          name: 'Анонс',
          content: {
            text: '🔥 Приглашаю на бесплатный вебинар!\n\nТема: "Как достичь цели за 90 дней"\nДата: Суббота, 19:00',
          },
        },
        {
          type: 'BUTTON',
          name: 'Регистрация',
          content: {
            text: 'Хочешь участвовать?',
            buttons: [
              { text: '✅ Да, регистрируюсь!', action: 'next' },
              { text: '❌ Не сейчас', action: 'end' },
            ],
          },
        },
        {
          type: 'MESSAGE',
          name: 'Подтверждение',
          content: {
            text: '👍 Отлично! Ты зарегистрирован.\n\nСсылка на вебинар придёт за час до начала.',
          },
        },
        {
          type: 'DELAY',
          name: 'Напоминание',
          content: {
            seconds: 3600,
            message: '⏰ Напоминаем: вебинар начнётся через час!',
          },
        },
      ],
    },
    empty: {
      name: 'Пустая воронка',
      description: 'Начни с чистого листа',
      nodes: [],
    },
  };

  async findAll(userId: string, query: FunnelQueryDto) {
    const { page = 1, limit = 10, status, search } = query;
    const skip = (page - 1) * limit;

    const where = {
      userId,
      ...(status && { status }),
      ...(search && {
        name: { contains: search, mode: 'insensitive' as const },
      }),
    };

    const [funnels, total] = await Promise.all([
      this.prisma.funnel.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { nodes: true } } },
      }),
      this.prisma.funnel.count({ where }),
    ]);

    return {
      data: funnels,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, userId: string) {
    const funnel = await this.prisma.funnel.findUnique({
      where: { id },
      include: { nodes: { orderBy: { createdAt: 'asc' } } },
    });

    if (!funnel) {
      throw new NotFoundException('Funnel not found');
    }

    if (funnel.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return funnel;
  }

  async create(userId: string, dto: CreateFunnelDto) {
    return this.prisma.funnel.create({
      data: {
        ...dto,
        userId,
      },
    });
  }

  async update(id: string, userId: string, dto: UpdateFunnelDto) {
    await this.findOne(id, userId); // Проверка доступа

    return this.prisma.funnel.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId); // Проверка доступа

    return this.prisma.funnel.delete({
      where: { id },
    });
  }

  async duplicate(funnelId: string, userId: string) {
    const original = await this.prisma.funnel.findFirst({
      where: { id: funnelId, userId },
      include: { nodes: { orderBy: { createdAt: 'asc' } } },
    });

    if (!original) {
      throw new NotFoundException('Funnel not found');
    }

    return this.prisma.funnel.create({
      data: {
        name: `${original.name} (копия)`,
        description: original.description,
        status: 'DRAFT',
        userId,
        nodes: {
          create: original.nodes.map((node) => ({
            type: node.type,
            name: node.name,
            content: node.content as Record<string, unknown>,
            position: node.position as Record<string, unknown>,
            order: node.order,
          })),
        },
      },
      include: { nodes: true },
    });
  }

  // Получить список шаблонов
  getTemplates() {
    return Object.entries(this.templates).map(([key, template]) => ({
      id: key,
      name: template.name,
      description: template.description,
      nodesCount: template.nodes.length,
    }));
  }

  // Создать воронку из шаблона
  async createFromTemplate(userId: string, templateId: string, name?: string) {
    const template = this.templates[templateId as keyof typeof this.templates];

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    // Создаём воронку
    const funnel = await this.prisma.funnel.create({
      data: {
        name: name || template.name,
        description: template.description,
        userId,
      },
    });

    // Создаём узлы
    if (template.nodes.length > 0) {
      type TemplateNode = {
        type: string;
        name: string;
        content: Record<string, unknown>;
      };
      await this.prisma.node.createMany({
        data: (template.nodes as TemplateNode[]).map((node, index) => ({
          type: node.type as
            | 'MESSAGE'
            | 'BUTTON'
            | 'CONDITION'
            | 'DELAY'
            | 'PAYMENT',
          name: node.name,
          content: node.content,
          funnelId: funnel.id,
          position: { x: 0, y: index * 100 },
        })),
      });
    }

    // Возвращаем с узлами
    return this.prisma.funnel.findUnique({
      where: { id: funnel.id },
      include: { nodes: true },
    });
  }
}
