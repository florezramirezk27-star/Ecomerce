import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PushDeviceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra (o actualiza) el token FCM del dispositivo para el usuario
   * autenticado. Un mismo token no puede pertenecer a dos usuarios distintos.
   */
  async registerOrUpdate(
    userId: string,
    token: string,
    platform: 'android' | 'ios',
  ) {
    return this.prisma.pushDevice.upsert({
      where: { token },
      update: {
        userId,
        platform,
        updatedAt: new Date(),
      },
      create: {
        userId,
        token,
        platform,
      },
    });
  }

  /** Elimina el dispositivo del usuario autenticado por su token. */
  async remove(userId: string, token: string) {
    const device = await this.prisma.pushDevice.findFirst({
      where: { token, userId },
    });

    if (!device) {
      throw new NotFoundException('Dispositivo no encontrado');
    }

    return this.prisma.pushDevice.delete({
      where: { id: device.id },
    });
  }

  /** Busca todos los dispositivos de usuarios con rol ADMIN. */
  async findAdminDevices() {
    return this.prisma.pushDevice.findMany({
      where: {
        user: {
          role: 'ADMIN',
        },
      },
      select: {
        id: true,
        token: true,
        platform: true,
        userId: true,
      },
    });
  }

  /** Busca un dispositivo por su token (para invalido/eliminar). */
  async findByToken(token: string) {
    return this.prisma.pushDevice.findUnique({
      where: { token },
      select: {
        id: true,
        token: true,
        userId: true,
        platform: true,
      },
    });
  }

  /** Elimina un dispositivo por su token (usado cuando Firebase reporta invalido). */
  async deleteByToken(token: string) {
    return this.prisma.pushDevice.delete({
      where: { token },
    });
  }

  /**
   * Elimina el token si todavía existe y devuelve cuántos dispositivos se
   * borraron. Es idempotente: dos workers pueden recibir UNREGISTERED para el
   * mismo token sin que el segundo falle con P2025.
   */
  async deleteByTokenIfPresent(token: string): Promise<number> {
    const result = await this.prisma.pushDevice.deleteMany({
      where: { token },
    });
    return result.count;
  }
}
