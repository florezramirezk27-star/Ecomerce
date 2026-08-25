import { Module } from '@nestjs/common';
import { DropiController } from './dropi.controller';
import { DropiService } from './dropi.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DropiController],
  providers: [DropiService],
  exports: [DropiService],
})
export class DropiModule {}
