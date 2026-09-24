import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const completedStatuses: OrderStatus[] = [
      OrderStatus.PAID,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
    ];

    const lowStockProducts: Array<{
      id: string;
      name: string;
      stock: number;
      lowStockThreshold: number;
      slug: string;
    }> = await this.prisma.$queryRaw`
      SELECT id, name, stock, "lowStockThreshold", slug
      FROM "Product"
      WHERE active = true
        AND stock <= "lowStockThreshold"
      ORDER BY stock ASC
    `;

    const [
      dailyRevenueResult,
      monthlyRevenueResult,
      totalRevenueResult,
      totalOrders,
      pendingOrders,
      totalUsers,
      topProductGroups,
      recentOrders,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        _sum: {
          total: true,
        },
        where: {
          createdAt: {
            gte: startOfToday,
          },
          status: {
            in: completedStatuses,
          },
        },
      }),
      this.prisma.order.aggregate({
        _sum: {
          total: true,
        },
        where: {
          createdAt: {
            gte: startOfMonth,
          },
          status: {
            in: completedStatuses,
          },
        },
      }),
      this.prisma.order.aggregate({
        _sum: {
          total: true,
        },
        where: {
          status: {
            in: completedStatuses,
          },
        },
      }),
      this.prisma.order.count(),
      this.prisma.order.count({
        where: {
          status: 'PENDING',
        },
      }),
      this.prisma.user.count(),
      this.prisma.orderItem.groupBy({
        by: ['productId'],
        _sum: {
          quantity: true,
        },
        orderBy: {
          _sum: {
            quantity: 'desc',
          },
        },
        take: 5,
      }),
      this.prisma.order.findMany({
        take: 5,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          user: true,
        },
      }),
    ]);

    const topProductIds = topProductGroups.map((group) => group.productId);

    const products = await this.prisma.product.findMany({
      where: {
        id: {
          in: topProductIds,
        },
      },
      select: {
        id: true,
        name: true,
        image: true,
      },
    });

    const productMap = new Map(
      products.map((product) => [product.id, product]),
    );

    const salesRows = await this.prisma.orderItem.findMany({
      where: {
        productId: {
          in: topProductIds,
        },
      },
      select: {
        productId: true,
        quantity: true,
        price: true,
      },
    });

    const revenueByProduct = new Map<string, number>();
    for (const row of salesRows) {
      const current = revenueByProduct.get(row.productId) ?? 0;
      revenueByProduct.set(
        row.productId,
        current + Number(row.price) * row.quantity,
      );
    }

    const topProducts = topProductGroups
      .map((group) => {
        const product = productMap.get(group.productId);
        if (!product) return null;

        return {
          id: product.id,
          name: product.name,
          image: product.image,
          totalSold: Number(group._sum.quantity ?? 0),
          revenue: revenueByProduct.get(group.productId) ?? 0,
        };
      })
      .filter(Boolean);

    return {
      dailyRevenue: Number(dailyRevenueResult._sum?.total ?? 0),
      monthlyRevenue: Number(monthlyRevenueResult._sum?.total ?? 0),
      totalRevenue: Number(totalRevenueResult._sum?.total ?? 0),
      totalOrders,
      pendingOrders,
      totalUsers,
      topProducts,
      recentOrders: recentOrders.map((order) => ({
        id: order.id,
        total: Number(order.total),
        status: order.status,
        createdAt: order.createdAt.toISOString(),
        customerName: order.user?.name ?? 'Anónimo',
      })),
      lowStockProducts: lowStockProducts.map((p) => ({
        id: p.id,
        name: p.name,
        stock: Number(p.stock),
        threshold: Number(p.lowStockThreshold),
        slug: p.slug,
      })),
    };
  }

  async getPerformance(period?: string) {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const completedStatuses: OrderStatus[] = [
      OrderStatus.PAID,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
    ];

    let start: Date;
    let mode: 'hour' | 'day';

    switch (period) {
      case 'today':
        start = startOfToday;
        mode = 'hour';
        break;
      case 'yesterday':
        start = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
        mode = 'hour';
        break;
      case '7days':
        start = new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000);
        mode = 'day';
        break;
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        mode = 'day';
    }

    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: {
          gte: start,
          ...(period === 'yesterday' ? { lt: startOfToday } : {}),
        },
        status: {
          in: completedStatuses,
        },
      },
      select: {
        total: true,
        createdAt: true,
      },
    });

    const localDateKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate(),
      ).padStart(2, '0')}`;

    const buckets = new Map<
      string,
      { label: string; ventas: number; pedidos: number }
    >();

    if (mode === 'hour') {
      for (let h = 0; h < 24; h++) {
        const key = String(h);
        buckets.set(key, {
          label: `${String(h).padStart(2, '0')}:00`,
          ventas: 0,
          pedidos: 0,
        });
      }
      for (const order of orders) {
        const h = order.createdAt.getHours();
        const bucket = buckets.get(String(h))!;
        bucket.ventas += Number(order.total);
        bucket.pedidos += 1;
      }
    } else {
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        buckets.set(localDateKey(d), {
          label: d.toLocaleDateString('es-CO', {
            day: '2-digit',
            month: '2-digit',
          }),
          ventas: 0,
          pedidos: 0,
        });
      }
      for (const order of orders) {
        const key = localDateKey(order.createdAt);
        const bucket = buckets.get(key);
        if (bucket) {
          bucket.ventas += Number(order.total);
          bucket.pedidos += 1;
        }
      }
    }

    return {
      period: period || 'month',
      mode,
      points: Array.from(buckets.values()),
    };
  }
}
