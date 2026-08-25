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
}
