import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';

import { SettingsService } from './settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  settingsLogoSchema,
  settingsHeroVideoSchema,
} from '../../common/schemas';

/**
 * Mock en memoria de `prisma.appSetting`. Guarda en un `Map` para que el test
 * pueda comprobar el estado persistido sin una base de datos real.
 */
function createPrismaMock() {
  const store = new Map<string, string>();

  return {
    __store: store,
    appSetting: {
      findUnique: ({ where }: { where: { key: string } }) => {
        const value = store.get(where.key);
        return Promise.resolve(
          value === undefined ? null : { key: where.key, value },
        );
      },
      upsert: ({
        where,
        create,
        update,
      }: {
        where: { key: string };
        create: { key: string; value: string };
        update: { value: string };
      }) => {
        if (store.has(where.key)) {
          store.set(where.key, update.value);
        } else {
          store.set(create.key, create.value);
        }
        return Promise.resolve({ key: where.key, value: store.get(where.key) });
      },
      deleteMany: ({ where }: { where: { key: string } }) => {
        const existed = store.delete(where.key);
        return Promise.resolve({ count: existed ? 1 : 0 });
      },
    },
  };
}

type PrismaMock = ReturnType<typeof createPrismaMock>;

describe('SettingsService', () => {
  let service: SettingsService;
  let prisma: PrismaMock;

  beforeEach(async () => {
    prisma = createPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
  });

  describe('lectura y escritura', () => {
    it('empieza sin logo', async () => {
      await expect(service.getLogo()).resolves.toBeNull();
    });

    it('guarda y devuelve el logo', async () => {
      await service.setLogo('https://cdn.example.com/logo.png');
      await expect(service.getLogo()).resolves.toBe(
        'https://cdn.example.com/logo.png',
      );
    });

    it('elimina el logo', async () => {
      await service.setLogo('https://cdn.example.com/logo.png');
      await service.removeLogo();
      await expect(service.getLogo()).resolves.toBeNull();
    });

    it('persiste el valor en la base de datos', async () => {
      await service.setLogo('https://cdn.example.com/logo.png');
      expect(prisma.__store.get('logo')).toBe(
        'https://cdn.example.com/logo.png',
      );
    });

    it('devuelve null cuando no hay fila', async () => {
      await expect(service.getHeroVideo()).resolves.toBeNull();
    });
  });

  describe('cache en memoria', () => {
    it('no vuelve a consultar la base si ya leyo la clave', async () => {
      const spy = jest.spyOn(prisma.appSetting, 'findUnique');

      await service.getLogo();
      await service.getLogo();

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('invalida la cache al escribir', async () => {
      await service.setLogo('https://cdn.example.com/logo-1.png');
      await service.setLogo('https://cdn.example.com/logo-2.png');

      await expect(service.getLogo()).resolves.toBe(
        'https://cdn.example.com/logo-2.png',
      );
    });
  });

  describe('video del banner', () => {
    it('empieza sin video', async () => {
      await expect(service.getHeroVideo()).resolves.toBeNull();
    });

    it('guarda y devuelve el video', async () => {
      await service.setHeroVideo('https://cdn.example.com/banner.mp4');
      await expect(service.getHeroVideo()).resolves.toBe(
        'https://cdn.example.com/banner.mp4',
      );
    });

    it('elimina el video', async () => {
      await service.setHeroVideo('https://cdn.example.com/banner.mp4');
      await service.removeHeroVideo();
      await expect(service.getHeroVideo()).resolves.toBeNull();
    });

    it('no pisa el logo al guardar el video', async () => {
      await service.setLogo('https://cdn.example.com/logo.png');
      await service.setHeroVideo('https://cdn.example.com/banner.mp4');

      await expect(service.getLogo()).resolves.toBe(
        'https://cdn.example.com/logo.png',
      );
      await expect(service.getHeroVideo()).resolves.toBe(
        'https://cdn.example.com/banner.mp4',
      );
    });

    it('borrar una clave inexistente no revienta', async () => {
      await expect(service.removeHeroVideo()).resolves.toBeUndefined();
    });
  });
});

describe('settingsLogoSchema', () => {
  const pipe = new ZodValidationPipe(settingsLogoSchema);
  const run = (logo: unknown) => pipe.transform({ logo });

  it('acepta una URL https', () => {
    expect(run('https://cdn.example.com/logo.png')).toEqual({
      logo: 'https://cdn.example.com/logo.png',
    });
  });

  it('acepta una URL http', () => {
    expect(run('http://cdn.example.com/logo.png')).toBeDefined();
  });

  it('rechaza algo que no es una URL', () => {
    expect(() => run('no-es-una-url')).toThrow(BadRequestException);
  });

  it('rechaza javascript:', () => {
    expect(() => run('javascript:alert(1)')).toThrow(BadRequestException);
  });

  it('rechaza data:', () => {
    expect(() => run('data:text/html,<script>alert(1)</script>')).toThrow(
      BadRequestException,
    );
  });

  it('rechaza file:', () => {
    expect(() => run('file:///etc/passwd')).toThrow(BadRequestException);
  });

  it('rechaza un esquema que no sea http/https', () => {
    // `z.string().url()` acepta `ftp://x` porque lo que comprueba es que tenga
    // esquema, asi que el `refine` de esquema es el que hace el trabajo.
    expect(() => run('ftp://example.com/logo.png')).toThrow(
      BadRequestException,
    );
  });

  it('acepta una URL larga por debajo del tope', () => {
    const larga = `https://cdn.example.com/${'a'.repeat(2000)}.png`;
    expect(run(larga)).toBeDefined();
  });

  it('rechaza una URL por encima del tope', () => {
    const larga = `https://cdn.example.com/${'a'.repeat(3000)}.png`;
    expect(() => run(larga)).toThrow(BadRequestException);
  });

  it('rechaza un logo vacio', () => {
    expect(() => run('')).toThrow(BadRequestException);
  });
});

describe('settingsHeroVideoSchema', () => {
  const pipe = new ZodValidationPipe(settingsHeroVideoSchema);
  const run = (video: unknown) => pipe.transform({ video });

  it('acepta una URL https de video', () => {
    expect(run('https://cdn.example.com/banner.mp4')).toEqual({
      video: 'https://cdn.example.com/banner.mp4',
    });
  });

  it('rechaza algo que no es una URL', () => {
    expect(() => run('no-es-una-url')).toThrow(BadRequestException);
  });

  it('rechaza javascript:', () => {
    expect(() => run('javascript:alert(1)')).toThrow(BadRequestException);
  });

  it('rechaza un esquema que no sea http/https', () => {
    expect(() => run('ftp://example.com/banner.mp4')).toThrow(
      BadRequestException,
    );
  });

  it('rechaza un video vacio', () => {
    expect(() => run('')).toThrow(BadRequestException);
  });
});
