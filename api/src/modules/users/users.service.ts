import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.findMany({
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          _count: {
            select: { orders: true },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  findOne(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        _count: {
          select: { orders: true },
        },
      },
    });
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        role: true,
        googleId: true,
        resetToken: true,
        resetTokenExpiry: true,
        failedLoginAttempts: true,
        lockedUntil: true,
      },
    });
  }

  create(data: { name: string; email: string; password: string }) {
    return this.prisma.user.create({
      data,
    });
  }

  update(
    id: string,
    data: {
      role?: 'ADMIN' | 'CUSTOMER';
      password?: string;
      resetToken?: string | null;
      resetTokenExpiry?: Date | null;
      failedLoginAttempts?: number;
      lockedUntil?: Date | null;
    },
  ) {
    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });
  }

  findByResetToken(token: string) {
    return this.prisma.user.findUnique({
      where: { resetToken: token },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        role: true,
        resetToken: true,
        resetTokenExpiry: true,
      },
    });
  }

  remove(id: string) {
    return this.prisma.user.delete({
      where: { id },
    });
  }
}
