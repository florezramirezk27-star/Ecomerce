import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import * as os from 'os';
import * as path from 'path';

import { SettingsService } from './settings.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { settingsLogoSchema } from '../../common/schemas';

/** Lo que el mock de `fs` registra para que el test pueda inspeccionarlo. */
interface EstadoDisco {
  /** Rutas pasadas a `writeFileSync`, en orden. */
  escrituras: string[];
  /** Pares `desde -> hasta` de cada `renameSync`. */
  renombres: string[];
  /** Sufijo de ruta que debe fallar. `''` hace fallar cualquier ruta. */
  fallarEn: string | null;
  /** Truncar la ruta antes de fallar, como hace un disco que se llena. */
  truncar: boolean;
}

/** Superficie del modulo `fs` tal y como lo expone este mock. */
type MockFs = typeof import('fs') & {
  __estado: EstadoDisco;
};

interface MockPath {
  __destino: { dir: string };
}

/**
 * `fs` no admite `jest.spyOn` cuando se importa como namespace ES (la propiedad
 * es no redefinible), asi que se envuelve el modulo entero. El wrapper registra
 * cada escritura y deja inyectar un fallo, que es justo lo que hay que simular
 * para comprobar que la escritura es atomica.
 *
 * `path` tambien se envuelve porque `SettingsService` resuelve su archivo con
 * `path.resolve(__dirname, ...)`, que cae en el `api/settings.json` del
 * repositorio. Sin redirigirlo, el test escribiria encima del archivo real.
 *
 * Los factories de `jest.mock` se evaluan antes que los `const` del modulo, asi
 * que el estado se lee con `jest.requireMock` y no se captura en el closure.
 */
jest.mock('fs', () => {
  const real = jest.requireActual<typeof import('fs')>('fs');

  const __estado: EstadoDisco = {
    escrituras: [],
    renombres: [],
    fallarEn: null,
    truncar: false,
  };

  return {
    __estado,
    existsSync: real.existsSync,
    readFileSync: real.readFileSync,
    readdirSync: real.readdirSync,
    mkdtempSync: real.mkdtempSync,
    rmSync: real.rmSync,
    unlinkSync: real.unlinkSync,
    writeFileSync: (
      ruta: Parameters<typeof real.writeFileSync>[0],
      datos: Parameters<typeof real.writeFileSync>[1],
      opciones?: Parameters<typeof real.writeFileSync>[2],
    ) => {
      const comoTexto = String(ruta);
      __estado.escrituras.push(comoTexto);

      if (__estado.fallarEn !== null && comoTexto.endsWith(__estado.fallarEn)) {
        if (__estado.truncar) real.writeFileSync(comoTexto, '', 'utf-8');
        throw new Error('disco lleno');
      }

      return real.writeFileSync(ruta, datos, opciones);
    },
    renameSync: (desde: string, hasta: string) => {
      __estado.renombres.push(`${desde} -> ${hasta}`);
      return real.renameSync(desde, hasta);
    },
  };
});

jest.mock('path', () => {
  const real = jest.requireActual<typeof import('path')>('path');
  const __destino = { dir: '' };

  return {
    ...real,
    __destino,
    resolve: (...args: string[]) =>
      // Solo importa el ultimo segmento (el nombre del archivo); el resto son
      // `..` de subida que solo sirvian para llegar al directorio del proyecto.
      __destino.dir
        ? real.join(__destino.dir, real.basename(args[args.length - 1]))
        : real.resolve(...args),
  };
});

const mockFs = () => jest.requireMock<MockFs>('fs');
const mockPath = () => jest.requireMock<MockPath>('path');

describe('SettingsService', () => {
  let service: SettingsService;
  let disco: MockFs;
  let estado: EstadoDisco;
  let destino: { dir: string };
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    disco = mockFs();
    estado = disco.__estado;
    estado.escrituras = [];
    estado.renombres = [];
    estado.fallarEn = null;
    estado.truncar = false;

    destino = mockPath().__destino;
    dir = disco.mkdtempSync(path.join(os.tmpdir(), 'settings-test-'));
    filePath = path.join(dir, 'settings.json');
    destino.dir = dir;

    const module: TestingModule = await Test.createTestingModule({
      providers: [SettingsService],
    }).compile();

    service = module.get<SettingsService>(SettingsService);

    // El constructor crea el archivo si no existe. Se limpia el registro para
    // que cada test mida solo las escrituras que el provoke.
    estado.escrituras = [];
    estado.renombres = [];
  });

  afterEach(() => {
    destino.dir = '';
    disco.rmSync(dir, { recursive: true, force: true });
  });

  describe('lectura y escritura', () => {
    it('empieza sin logo', () => {
      expect(service.getLogo()).toBeNull();
    });

    it('guarda y devuelve el logo', () => {
      service.setLogo('https://cdn.example.com/logo.png');
      expect(service.getLogo()).toBe('https://cdn.example.com/logo.png');
    });

    it('elimina el logo', () => {
      service.setLogo('https://cdn.example.com/logo.png');
      service.removeLogo();
      expect(service.getLogo()).toBeNull();
    });

    it('sobrevive a un archivo corrupto en vez de romper el arranque', () => {
      disco.writeFileSync(filePath, '{esto no es json', 'utf-8');
      expect(service.getLogo()).toBeNull();
    });
  });

  describe('escritura atomica', () => {
    it('escribe primero en un temporal y luego lo renombra al destino', () => {
      service.setLogo('https://cdn.example.com/logo.png');

      // El destino final nunca se abre para escribir: se renombra encima. Un
      // lector concurrente solo ve el archivo viejo o el nuevo, nunca un estado
      // a medias.
      expect(estado.escrituras).toHaveLength(1);
      expect(estado.escrituras[0].endsWith('.tmp')).toBe(true);
      expect(estado.escrituras[0]).not.toBe(filePath);
      expect(estado.renombres).toEqual([
        `${estado.escrituras[0]} -> ${filePath}`,
      ]);
    });

    it('el archivo final siempre es JSON completo', () => {
      service.setLogo('https://cdn.example.com/logo.png');
      service.setLogo('https://cdn.example.com/logo-2.png');

      const contenido = disco.readFileSync(filePath, 'utf-8');
      const meta = JSON.parse(contenido) as { logo: string };

      expect(meta.logo).toBe('https://cdn.example.com/logo-2.png');
    });

    it('un corte a mitad deja intacto el valor anterior', () => {
      service.setLogo('https://cdn.example.com/original.png');

      // Truncar la ruta y luego morir es lo que hace el disco cuando se acaba
      // el espacio, o el proceso cuando lo matan a mitad de un `writeFileSync`.
      // Truncar es el detalle que importa: por eso el temporal tiene que ser
      // OTRO archivo y no el destino.
      estado.fallarEn = '';
      estado.truncar = true;

      expect(() =>
        service.setLogo('https://cdn.example.com/nuevo.png'),
      ).toThrow('disco lleno');

      estado.fallarEn = null;
      estado.truncar = false;

      expect(service.getLogo()).toBe('https://cdn.example.com/original.png');
    });

    it('el temporal fallido se borra en vez de acumularse', () => {
      service.setLogo('https://cdn.example.com/original.png');

      estado.fallarEn = '.tmp';

      expect(() =>
        service.setLogo('https://cdn.example.com/nuevo.png'),
      ).toThrow('disco lleno');

      estado.fallarEn = null;

      expect(disco.readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual(
        [],
      );
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
