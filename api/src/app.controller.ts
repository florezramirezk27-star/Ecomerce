import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './common/redis/redis.service';

@Controller()
export class AppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  home() {
    return {
      message: 'API Ecommerce funcionando',
    };
  }

  @Get('health')
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;

    return {
      status: 'ok',
      database: 'connected',
    };
  }

  @Get('ready')
  async ready() {
    await this.prisma.$queryRaw`SELECT 1`;
    const redisConnected = await this.redis.ping();

    if (process.env.REDIS_REQUIRED === 'true' && !redisConnected) {
      throw new ServiceUnavailableException({
        status: 'degraded',
        database: 'connected',
        redis: 'unavailable',
      });
    }

    return {
      status: 'ok',
      database: 'connected',
      redis: redisConnected ? 'connected' : 'not-configured',
    };
  }
}
