import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PushDeviceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra (o actualiza) el token FCM del dispositivo para el usuario
   * autenticado.
   *
   * Un token existente nunca se reasigna a otra cuenta. La restricción UNIQUE
   * de la base de datos resuelve carreras entre registros simultáneos: si otra
   * cuenta gana el INSERT, el segundo intento devuelve HTTP 409.
   */
  async registerOrUpdate(
    userId: string,
    token: string,
    platform: 'android' | 'ios',
  ) {
    const existing = await this.prisma.pushDevice.findUnique({
      where: { token },
      select: { id: true, userId: true },
    });

    if (existing) {
      return this.updateOwnedDevice(existing, userId, platform, token);
    }

    try {
      return await this.prisma.pushDevice.create({
        data: {
          userId,
          token,
          platform,
        },
      });
    } catch (error) {
      // Dos solicitudes pueden observar que el token no existe y competir
      // por insertarlo. La restricción UNIQUE(token) elige un único ganador.
      if (
        !(
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        )
      ) {
        throw error;
      }

      const raced = await this.prisma.pushDevice.findUnique({
        where: { token },
        select: { id: true, userId: true },
      });

      // Si el registro ganador fue eliminado entre el conflicto y esta
      // lectura, conserva el error original para permitir reintentar.
      if (!raced) {
        throw error;
      }

      return this.updateOwnedDevice(raced, userId, platform, token);
    }
  }

  /**
   * Actualiza solo dispositivos que continúan perteneciendo al usuario.
   * La condición adicional userId evita modificar un registro si su dueño
   * cambia concurrentemente durante un despliegue gradual.
   */
  private async updateOwnedDevice(
    existing: { id: string; userId: string },
    userId: string,
    platform: 'android' | 'ios',
    token: string,
  ) {
    if (existing.userId !== userId) {
      throw new ConflictException(
        'Este token FCM ya está asociado a otra cuenta.',
      );
    }

    try {
      return await this.prisma.pushDevice.update({
        where: {
          id: existing.id,
          userId,
        },
        data: {
          platform,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        const latest = await this.prisma.pushDevice.findUnique({
          where: { token },
          select: { userId: true },
        });

        if (latest && latest.userId !== userId) {
          throw new ConflictException(
            'Este token FCM ya está asociado a otra cuenta.',
          );
        }
      }

      throw error;
    }
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
