import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';

@Module({
  imports: [PrismaModule],
  providers: [CartService],
  controllers: [CartController],
  exports: [CartService],
})
export class CartModule {}
