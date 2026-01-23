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
    course: {
      name: 'Продажа курса',
      description: 'Шаблон для продажи онлайн-курса',
      nodes: [
        { type: 'MESSAGE', name: 'Приветствие', content: { text: 'Привет! 👋 Добро пожаловать на мой курс.' } },
        { type: 'MESSAGE', name: 'О курсе', content: { text: 'В этом курсе вы узнаете...' } },
        { type: 'BUTTON', name: 'Выбор', content: { text: 'Хотите узнать больше?', buttons: [{ text: 'Да, расскажите!' }] } },
        { type: 'PAYMENT', name: 'Оплата', content: { productName: 'Онлайн-курс', price: 4990 } },
        { type: 'MESSAGE', name: 'Спасибо', content: { text: 'Спасибо за покупку! Вот ваш доступ...' } },
      ],
    },
    consultation: {
      name: 'Запись на консультацию',
      description: 'Шаблон для записи на консультацию',
      nodes: [
        { type: 'MESSAGE', name: 'Приветствие', content: { text: 'Здравствуйте! Я помогу записать вас на консультацию.' } },
        { type: 'MESSAGE', name: 'Описание', content: { text: 'На консультации мы разберём...' } },
        { type: 'PAYMENT', name: 'Оплата', content: { productName: 'Консультация 60 мин', price: 2990 } },
        { type: 'MESSAGE', name: 'Подтверждение', content: { text: 'Отлично! Я свяжусь с вами для выбора времени.' } },
      ],
    },
    leadmagnet: {
      name: 'Лид-магнит',
      description: 'Бесплатный материал для сбора контактов',
      nodes: [
        { type: 'MESSAGE', name: 'Приветствие', content: { text: 'Привет! У меня есть для тебя подарок 🎁' } },
        { type: 'MESSAGE', name: 'Описание', content: { text: 'Это бесплатный гайд/чеклист/...' } },
        { type: 'MESSAGE', name: 'Выдача', content: { text: 'Держи ссылку на материал: ...' } },
      ],
    },
    empty: {
      name: 'Пустая воронка',
      description: 'Начните с чистого листа',
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
      await this.prisma.node.createMany({
        data: template.nodes.map((node, index) => ({
          ...node,
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
