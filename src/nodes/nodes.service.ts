import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNodeDto } from './dto/create-node.dto';
import { UpdateNodeDto } from './dto/update-node.dto';

@Injectable()
export class NodesService {
  constructor(private prisma: PrismaService) {}

  // Проверка что воронка принадлежит юзеру
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

  // Проверка что узел принадлежит юзеру (через воронку)
  private async checkNodeAccess(nodeId: string, userId: string) {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      include: { funnel: true },
    });

    if (!node) {
      throw new NotFoundException('Node not found');
    }

    if (node.funnel.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return node;
  }

  async findAllByFunnel(funnelId: string, userId: string) {
    await this.checkFunnelAccess(funnelId, userId);

    return this.prisma.node.findMany({
      where: { funnelId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string, userId: string) {
    return this.checkNodeAccess(id, userId);
  }

  async create(funnelId: string, userId: string, dto: CreateNodeDto) {
    await this.checkFunnelAccess(funnelId, userId);

    return this.prisma.node.create({
      data: {
        ...dto,
        funnelId,
        position: dto.position || { x: 0, y: 0 },
      },
    });
  }

  async update(id: string, userId: string, dto: UpdateNodeDto) {
    await this.checkNodeAccess(id, userId);

    return this.prisma.node.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, userId: string) {
    await this.checkNodeAccess(id, userId);

    return this.prisma.node.delete({
      where: { id },
    });
  }
}
