import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService, parseProductStatus } from './products.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogCacheService } from '../../common/cache/catalog-cache.service';

describe('ProductsService', () => {
  let service: ProductsService;
  let count: jest.Mock;
  /** Ultimo `where` con el que se consulto el listado. */
  let lastWhere: { active?: boolean } = {};

  beforeEach(async () => {
    lastWhere = {};
    const findMany = (args: { where: { active?: boolean } }) => {
      lastWhere = args.where;
      return Promise.resolve([]);
    };
    count = jest.fn().mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: PrismaService,
          useValue: {
            product: { findMany, count },
          },
        },
        {
          provide: CatalogCacheService,
          useValue: {
            remember: (
              _scope: string,
              _parts: unknown[],
              loader: () => Promise<unknown>,
            ) => loader(),
            invalidate: async () => {},
          },
        },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  /** Devuelve el `where` con el que se consulto el listado. */
  const whereOf = (): { active?: boolean } => lastWhere;

  describe('filtro por estado', () => {
    it('para un anonimo solo lista activos', async () => {
      await service.findAll();
      expect(whereOf().active).toBe(true);
    });

    it('el admin sin `status` ve todo (historico)', async () => {
      await service.findAll(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        true,
      );
      expect(whereOf().active).toBeUndefined();
    });

    it('status=active filtra activos aunque sea admin', async () => {
      await service.findAll(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        true,
        'active',
      );
      expect(whereOf().active).toBe(true);
    });

    it('status=inactive filtra los archivados', async () => {
      await service.findAll(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        true,
        'inactive',
      );
      expect(whereOf().active).toBe(false);
    });

    it('status=all no filtra por estado', async () => {
      await service.findAll(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        true,
        'all',
      );
      expect(whereOf().active).toBeUndefined();
    });

    it('un `status` invalido se ignora y cae al comportamiento por defecto', async () => {
      await service.findAll(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        false,
        'basura' as never,
      );
      expect(whereOf().active).toBe(true);
    });
  });

  describe('parseProductStatus', () => {
    it('acepta los valores validos', () => {
      expect(parseProductStatus('active')).toBe('active');
      expect(parseProductStatus('inactive')).toBe('inactive');
      expect(parseProductStatus('all')).toBe('all');
    });

    it('descarta vacios y desconocidos', () => {
      expect(parseProductStatus(undefined)).toBeUndefined();
      expect(parseProductStatus('')).toBeUndefined();
      expect(parseProductStatus('deleted')).toBeUndefined();
    });
  });
});
